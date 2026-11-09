# ADR-037 — Payment Asynchronous Lifecycle and Provider Capabilities

> **Provenance:**
> - Canonical owner: comity-development
> - Raised by: Commerce Foundation v0 prerequisites **C3** and **C4** (`commerce/docs/architecture/resolution/`), and the Payment design proposal (revision 3, owner-approved design)
> - Companion ADRs: ADR-030 (command idempotency, revised in place), ADR-031 (refunds, revised in place)
> - **Amended by the owner-approved decision OD-F9 (amount representability).** §3 and §8b record the requested / provider-reported / provider-confirmed distinction, the
>   no-echo rule, the `ReportedAmount` representation and the `unrepresentable_success` reason with typed details. Status and every other decision of this ADR are unchanged.

**Status:** Accepted

## Context

`@comity/payment` can initiate a payment synchronously and nothing else. Real providers are asynchronous: a payment may require customer action
(for example a redirect), may stay pending, and may complete through a notification or only through a lookup. Capture, cancellation and refund can
also complete later than the call that requested them.

### Verified repository facts

- `PaymentProvider` has one method, `initiate(request): Promise<Result<PaymentOutcome, PaymentError>>` (`community/packages/payment/src/contracts/payment-provider.ts`).
  The package exports only the contracts and `MemoryPaymentProvider` (`payment/src/index.ts`).
- `PaymentStatus` is `authorized | captured | failed | cancelled`, with the note "Do not add: pending, processing, refunded, expired"
  (`payment/src/contracts/payment-outcome.ts`). `PaymentOutcome.paymentId` and `provider` are optional.
- `PaymentErrorReason` is `invalid_request | internal_error` (`payment/src/errors/payment.ts`). `PaymentModuleEvents` is empty (`payment/src/setup/types.ts`).
- `PAYMENT_PROVIDER_TOKEN` is typed as `PaymentProvider` (`payment/src/setup/types.ts`), so optional abilities of the same adapter object are invisible to a
  consumer that resolves it.
- `OrderPaymentStatus` is `authorized | captured | failed | cancelled` (`community/packages/order/src/contracts/payment-snapshot.ts`). Order deduplicates facts on
  `(paymentId, status)`, treats a recorded `captured`, `failed` or `cancelled` as terminal, and appends a fact without `paymentId` every time
  (`order/src/entities/order.ts`, `evaluatePaymentFact`). The progression is an owner-confirmed decision and is **not** reopened here.
- `OrderData` has **no order-level `reference` field**. The only `reference` fields in the Order contracts are `OrderLineSubject.reference` and
  `OrderPaymentSnapshot.reference` (`order/src/contracts/order.ts`, `line.ts`, `payment-snapshot.ts`). The Order's stable identity is `OrderId`
  (`order/src/value-objects/order-id.ts`).
- `Currency.create(code)` and `Money.create(amount: bigint, currency)` are public, `Result`-returning APIs of `@comity/pricing`.
- ADR-008 registers `payment → pricing` as a **type-only** edge. ADR-029 (C1) and ADR-016 are **Proposed**; ADR-030 (C3), ADR-031 (C4) and this ADR are **Accepted**.
- No payment service provider (PSP) has been selected in any Comity repository.

## Problem statement

Define the smallest provider-independent Payment contract that:

1. represents asynchronous initiation, capture, cancellation and refund without turning in-progress observations into Order facts;
2. lets an application know, before checkout, what an adapter supports, and makes unsupported combinations impossible or detectable;
3. keeps identifiers with different owners and lifetimes apart;
4. states which guarantees belong to the Payment contract, the adapter, the application and the persistence layer, and never claims durability that
   nobody provides.

Out of scope: a Payment aggregate, a workflow engine, a payment provider selection, partial or multiple captures, disputes and chargebacks, saved methods,
and the Order `recordReversal` operation (ADR-031, ADR-032).

## Decision

### 1. Separate vocabularies

Four vocabularies are distinct and MUST NOT be conflated.

| Vocabulary | Values | Describes | Owner |
|---|---|---|---|
| **Payment state** (`PaymentState`) | `requires_action`, `pending`, `authorized`, `captured`, `failed`, `cancelled` | The provider-side state of **one payment** at the moment it was observed | The **provider** is the authority. The adapter reports it. |
| **Operation status** (`OperationStatus`) | `pending`, `succeeded`, `failed` | The status of **one command** (capture, cancel, refund) against a payment | The provider; the adapter reports it |
| **Payment-attempt resolution** | statuses and classes of §6 | The application's own tracking of one payment attempt | The **application** |
| **Order payment facts** (`OrderPaymentStatus`) | `authorized`, `captured`, `failed`, `cancelled` — **unchanged** | Commercial facts recorded on an Order | The **Order** domain |

Rules:

1. `PaymentStatus` stays exactly `authorized | captured | failed | cancelled`. `PaymentState` is `PaymentStatus | "pending" | "requires_action"`.
2. `pending` and `requires_action` are payment states returned to callers. They MUST NEVER be recorded as Order payment facts.
3. `requires_action` exists only as a payment state. `pending` exists in both the payment-state and operation-status vocabularies, with different meanings
   (the payment is being processed / the command was accepted but has not completed). The distinct type names keep them apart.
4. Initiation has no operation status. It creates the payment, and its result **is** the resulting payment state. A contract-level failure that created
   no payment is a `PaymentError`.
5. `succeeded` and `failed` appear as operation statuses and, in §6, as attempt-resolution **classes**. They are different concepts. Documents and code
   MUST qualify them ("operation status `failed`", "attempt class `failed`"). In particular, a **successful cancel operation** produces payment state
   `cancelled`, which is attempt class `failed` (no money moved).
6. **There is no Payment aggregate.** The provider owns provider-side payment state, the application owns attempt tracking and orchestration, and the
   Order records the commercial payment facts. A Payment aggregate becomes justifiable only if several consumers must share one payment ledger, or if split
   payment or marketplace flows appear; that is deferred.

### 2. Operations and their results

Operations are commands or queries. A command result is authoritative for what it reports when produced; the current state is obtained by lookup.

| Operation | Kind | Result | Completion when not immediate |
|---|---|---|---|
| `initiate` | command | `PaymentOutcome` (a payment state) | `retrieve(paymentId)`; verified notification; reconciliation |
| `capture` (manual-capture bindings only; full authorized amount in v1) | command | `PaymentOperationOutcome` | `retrieveOperation(operationId)` |
| `cancel` (void an authorization, or abandon an incomplete payment) | command | `PaymentOperationOutcome` | `retrieveOperation(operationId)` |
| `refund` | command | `RefundOutcome` (ADR-031) | `retrieveRefund(refundId)` |
| `retrieve`, `retrieveOperation`, `retrieveRefund` | queries | current state, or `null` when unknown to the provider | — |
| `verify` | translation | normalized notifications | — |

Authority rules:

1. A command result is authoritative for what it reports when it was produced. A `PaymentError` of reason `internal_error` from a command means
   **outcome unknown**, never "failed".
2. A lookup result is authoritative for the **current** state of the payment, operation or refund.
3. A verified notification is authoritative that the transition it reports **occurred**. It is not authoritative that it is the current state.
4. Unverified input (redirect returns, client callbacks, unverified bodies) never changes state. It may only trigger a lookup.
5. Ordering is never derived from timestamps. Order between facts comes only from the Order progression (`authorized → captured | failed | cancelled`).
   `occurredAt` on a notification is informational.
6. Each adapter documents its **provider-state mapping**: provider "requires confirmation" → `requires_action`; "processing" → `pending`; "requires
   capture" → `authorized`; "succeeded/settled" → `captured`; "declined/error" → `failed`; "canceled/voided/expired/abandoned" → `cancelled`. Disputes and
   chargebacks are never mapped to a payment state; they arrive as `other` notifications and are deferred.

**Capture success semantics.** Capture exists only on manual-capture bindings (full authorized amount in v1).

1. **Meaning.** Operation status `succeeded` for a capture means the provider confirms that **the capture operation completed**, and (by the adapter's documented mapping,
   rule 6) that the payment is now `captured`. It is **operation completion**. It is not a `PaymentOutcome`, which alone defines the `captured` payment state and always carries
   a mandatory, valid, provider-confirmed amount.
2. **Amount.** The `amount` of a `succeeded` capture result is governed by `PaymentOperationOutcome` (§3), **not** by the `ReportedAmount` union, and never carries the flag.
   It is optional, because the operation contract does not require one. If present it is the **provider-confirmed** captured amount and MUST be valid; **present but unusable
   is `unrepresentable_success`** (`scope: "capture"`, §8b). **Absent is permitted**: it is neither that anomaly nor an unknown outcome, but it is **insufficient** on its own
   (rule 4).
3. **Evidence required for an Order `captured` fact.** The application records the fact, and only from provider-confirmed evidence that identifies the `paymentId` and carries a
   **valid** amount, which is one of: (a) a `succeeded` capture result **that carries a valid amount** (from the command or from `retrieveOperation`); (b) a `PaymentOutcome` in
   state `captured` (from `retrieve`); (c) a verified `payment` notification in state `captured`; (d) an attributed manual-reconciliation entry recording provider evidence of a
   valid amount. A `succeeded` signal **without** such an amount, including every `operation` notification (they carry no amount), is **never** sufficient. The amount must also
   satisfy F-2 and F-3; a valid amount that does not is a §8 mismatch, held.
4. **Missing amount.** The application holds: no `captured` fact, no confirmation, no fulfilment, and no replay. It obtains payment-level evidence through `retrieve`, a verified
   `payment` notification or an attributed manual-reconciliation entry (all existing mechanisms; §7 reconciliation covers it). A payment still reported `authorized` is **not**
   evidence of capture and stays held. If that evidence carries an unusable amount, it is `unrepresentable_success` with `scope: "payment"`.
5. **Lookups.** `retrieveOperation` (rule C-4, unchanged) answers what happened to **this operation** (and may carry the optional amount under the same rules); `retrieve` answers
   the **current payment state and amount**. Neither replaces the other, and no new provider capability is required.

### 3. Contract sketch (normative shape; exact names follow package conventions at implementation)

`Result` is `@comity/primitives/result`, `Instant` is `@comity/primitives/time`, `Money` is a **type-only** import from `@comity/pricing`. No new
dependency edge is introduced.

```ts
export type PaymentStatus = "authorized" | "captured" | "failed" | "cancelled"; // unchanged
export type PaymentState = PaymentStatus | "pending" | "requires_action";
export type OperationStatus = "pending" | "succeeded" | "failed";

export interface PaymentAction { readonly kind: "redirect"; readonly url: string } // closed union

export interface PaymentRequest {
  readonly amount: Money;
  readonly idempotencyKey: string;           // ADR-030
  readonly reference: string;                // the application PaymentAttemptId (§4)
  readonly capture: "automatic" | "manual";
  readonly returnUrl?: string;               // required when a redirect may be returned
}

/** What the provider reported about an amount (OD-F9, §8b). A discriminated union: contradictory combinations cannot be constructed. */
type ReportedAmount =
  | { readonly amount: Money; readonly providerAmountUnusable?: never }   // a valid amount was supplied
  | { readonly amount?: never; readonly providerAmountUnusable?: true };  // none supplied (flag absent) or supplied but unusable (flag true)

interface PaymentOutcomeFields {
  readonly provider: string;                 // binding id; required
  readonly reference?: string;               // echoed PaymentAttemptId, when the provider supplies it
  readonly authorizedAt?: Instant;
  readonly capturedAt?: Instant;
}

// `amount` is never the requested amount echoed back: provider-reported or provider-confirmed only.
export type PaymentOutcome =
  | (PaymentOutcomeFields & { readonly state: "authorized" | "captured"; readonly paymentId: string; readonly amount: Money })       // provider-confirmed: mandatory, valid
  | (PaymentOutcomeFields & ReportedAmount & { readonly state: "failed" | "cancelled" | "pending"; readonly paymentId?: string })
  | (PaymentOutcomeFields & ReportedAmount & { readonly state: "requires_action"; readonly paymentId?: string; readonly action: PaymentAction });

interface PaymentOperationFields {
  readonly provider: string;
  readonly paymentId: string;
  readonly operationId?: string;             // ProviderOperationId; REQUIRED when status is `pending` (rule C-10)
  readonly completedAt?: Instant;
}

export type PaymentOperationOutcome = PaymentOperationFields & (
  | { readonly operation: "cancel"; readonly status: OperationStatus; readonly amount?: never; readonly providerAmountUnusable?: never } // a cancel carries neither
  | { readonly operation: "capture"; readonly status: "succeeded"; readonly amount?: Money; readonly providerAmountUnusable?: never }    // an unusable returned amount is case B
  | (ReportedAmount & { readonly operation: "capture"; readonly status: "pending" | "failed" })
);

export interface PaymentProvider { initiate(request: PaymentRequest): Promise<Result<PaymentOutcome, PaymentError>> }
export interface PaymentStatusProvider { retrieve(paymentId: string): Promise<Result<PaymentOutcome | null, PaymentError>> }
export interface PaymentCaptureProvider { capture(r: { paymentId: string; amount: Money; idempotencyKey: string }): Promise<Result<PaymentOperationOutcome, PaymentError>> }
export interface PaymentCancelProvider { cancel(r: { paymentId: string; idempotencyKey: string }): Promise<Result<PaymentOperationOutcome, PaymentError>> }
export interface PaymentOperationLookup { retrieveOperation(operationId: string): Promise<Result<PaymentOperationOutcome | null, PaymentError>> }
// PaymentRefundProvider (refund, retrieveRefund), RefundRequest and RefundOutcome: ADR-031.

export type PaymentNotification =                        // verification happens BEFORE this type exists (§7)
  | { kind: "payment"; provider: string; eventId: string; occurredAt?: Instant; paymentId: string; reference?: string; state: "authorized" | "captured"; amount: Money }
  | (ReportedAmount & { kind: "payment"; provider: string; eventId: string; occurredAt?: Instant; paymentId: string; reference?: string; state: "failed" | "cancelled" })
  | { kind: "refund"; provider: string; eventId: string; occurredAt?: Instant; paymentId: string; refundId: string; reference?: string; status: "succeeded"; amount: Money }
  | (ReportedAmount & { kind: "refund"; provider: string; eventId: string; occurredAt?: Instant; paymentId: string; refundId: string; reference?: string; status: "pending" | "failed" })
  | { kind: "operation"; provider: string; eventId: string; occurredAt?: Instant; operation: "capture" | "cancel"; paymentId: string; operationId: string; status: "succeeded" | "failed" }
  | { kind: "other"; provider: string; eventId: string; occurredAt?: Instant; providerEventType: string };

export interface PaymentNotificationVerifier {
  verify(input: { body: Uint8Array; headers: Readonly<Record<string, string>> }): Promise<Result<ReadonlyArray<PaymentNotification>, PaymentError>>;
}

export type PaymentErrorReason =
  | "invalid_request"          // cause?: "malformed" | "unsupported"
  | "internal_error"           // from a command: OUTCOME UNKNOWN
  | "idempotency_conflict"     // ADR-030; cause: "request_mismatch" | "in_progress"
  | "invalid_notification"     // new; cause: "signature" | "malformed"
  | "invalid_configuration"    // new; binding validation (§5)
  | "unrepresentable_success"; // OD-F9; provider-confirmed success with unrepresentable financial data (§8b)

/** Typed details of `unrepresentable_success`: the minimum for exact correlation. Mandatory identifiers per path: §8b. The underlying error is the `cause`. */
export interface UnrepresentableSuccessDetails {
  readonly provider: string;                 // the PaymentProviderBinding.id
  readonly scope: "payment" | "capture" | "refund"; // a cancel cannot produce this error
  readonly paymentId?: string;
  readonly operationId?: string;
  readonly refundId?: string;
  readonly reference?: string;               // fallback only, never a substitute for an available identifier
  readonly eventId?: string;                 // mandatory for notifications
}
```

- The outcome discriminant is `state` (not `status`), so a payment state cannot be confused with an `OperationStatus`.
- `paymentId` is **required** for `authorized` and `captured` (closes ADR-030 Q4 and ADR-031 Q2). It is optional for `failed`, `cancelled`, `pending`
  and `requires_action`, because the provider may not have created a payment object.
- `invalid_notification` and `invalid_configuration` are separate reasons because their recovery differs (`errors.md` §9): a signature failure means
  reject, alert, never retry; a configuration failure means composition fails.
- **Amounts (OD-F9, owner-approved).** The *requested* amount (submitted by the application) is held by the application in its persisted request or attempt data. A
  *provider-reported* amount is one the provider explicitly returned, including in non-terminal states. A *provider-confirmed* amount is one the provider authoritatively confirmed for
  a terminal financial outcome. **A requested amount MUST NOT be echoed into a provider outcome** and presented as provider-reported or provider-confirmed. Settled success
  (`authorized`, `captured`, refund `succeeded`) requires a mandatory, valid, provider-confirmed `amount`; every other amount follows `ReportedAmount` (§8b).
- Breaking changes (`PaymentRequest`, `PaymentOutcome`, `RefundOutcome`) have no in-repository consumers: nothing outside `@comity/payment` imports its contracts. The in-memory
  provider's present echo of `request.amount` is test-double behaviour that the implementation conforms to this rule.

### 4. Identifiers

The following identifiers are distinct and MUST NOT be used interchangeably.

| Identifier | Generated by | Scope | Persisted | Sent to the PSP | On the Order |
|---|---|---|---|---|---|
| `OrderId` | Application | global (tenant-scoped storage) | Order; attempt records | **No** | is the Order |
| `PaymentAttemptId` | Application (opaque, globally unique) | global | Payment-attempt record | **Yes**, as the payment `reference` | `OrderPaymentSnapshot.reference` of that attempt's facts |
| `ProviderPaymentId` (`paymentId`) | Provider | binding | Attempt record (unique `(binding, paymentId)`); Order facts | — | `paymentId` |
| `ProviderEventId` (`eventId`) | Provider | binding | Only if an inbox is used | — | **Never** |
| `ProviderOperationId` (`operationId`) | Provider | binding | On the **operation record of the one capture or cancel invocation** it identifies, correlated with the `PaymentAttemptId` and the **operation type** (capture or cancel) | — | Never |
| Operation idempotency key | Application | binding | Attempt record, **before** the call | Yes (provider's native key) | Never |
| `RefundAttemptId` / `refundId` | Application / Provider | see ADR-031 | see ADR-031 | see ADR-031 | see ADR-031 |

Rules:

1. The PSP receives the application-generated `PaymentAttemptId` as the payment `reference`, together with the operation's idempotency key.
   **`OrderId` is not sent to the PSP.**
2. A `ProviderOperationId` identifies one provider-side capture or cancel. It is correlated with its payment attempt and operation type and MUST NOT be
   confused with the `PaymentAttemptId`, the `ProviderPaymentId` or the idempotency key.
2a. **One payment attempt may involve several provider operations**: its initiation, any number of capture and cancel invocations (each with its own key,
   ADR-030 §3), and any number of refunds (each its own refund attempt, ADR-031). The application therefore persists **one operation record per command
   invocation**, **before** the call (A3), carrying logically: the owning `PaymentAttemptId` (for a refund, the `RefundAttemptId`), the **operation type**
   (initiate, capture, cancel or refund), the operation's **idempotency key**, and, once the provider returns it, the provider identity of that operation:
   `ProviderPaymentId` for an initiation, `ProviderOperationId` for a capture or cancel, `refundId` for a refund. There is **no single operation-id slot per
   attempt**. Pending capture and cancel operations are reconciled **individually**, each through `retrieveOperation` with its own `ProviderOperationId`.
2b. A `ProviderOperationId` and an `operation` notification are correlated by `(binding, operationId)` to exactly one operation record, which identifies
   the attempt and the operation type. Tenant and order come from the attempt record, never from the payload. This ADR prescribes no storage schema.
3. `OrderPaymentSnapshot.reference` is the `PaymentAttemptId` of the attempt that produced the fact. **No Order-level reference field is introduced.** The
   Order's lifetime-stable identity is `OrderId`; an Order may carry facts of several attempts, each attributable by its `reference`.
4. Correlation MUST NOT depend on the PSP echoing `reference`. A payment notification is correlated by `(binding, paymentId)` first, then by the echoed
   `reference` as `PaymentAttemptId`. Tenant and order are taken from the attempt record, **never from the payload**. A notification that cannot be
   correlated is not acknowledged (direct strategy) or parked (inbox strategy) until the attempt learns its `paymentId`.

**Terminology: `provider` is the binding identifier.** The `provider` field on Payment outcomes, notifications and error details carries the
`PaymentProviderBinding.id` of the configured provider instance (adapter plus merchant account) that scopes `paymentId`, `operationId`, `refundId`, `eventId` and
idempotency keys. It does not identify the PSP or integration *type*; no such identifier is modelled or needed, and no separate `bindingId` name is introduced.

### 5. Capability descriptor and startup validation

Interface presence alone is insufficient because:

1. the application resolves the provider through a token typed as one interface, so optional ports on the same object are invisible without unchecked casts;
2. it cannot express parameter-level variance (partial or multiple refunds, manual capture, cancelling incomplete payments);
3. it cannot express asynchronous behaviour, yet asynchrony determines which completion mechanisms are mandatory.

Each adapter publishes a **static, data-only descriptor**, and the composition resolves a **binding** that bundles the descriptor with the optional ports.
There are no runtime feature probes and no plugin framework.

```ts
export interface PaymentCapabilities {
  readonly asynchronousInitiation: boolean;
  readonly customerActions: ReadonlyArray<PaymentAction["kind"]>;   // v1: "redirect"
  readonly statusLookup: boolean;
  readonly notifications: boolean;
  readonly operationLookup: boolean;
  readonly manualCapture: false | { readonly asynchronous: boolean };
  readonly cancel: false | { readonly incomplete: boolean; readonly authorized: boolean; readonly asynchronous: boolean };
  readonly refund: false | { readonly partial: boolean; readonly multiple: boolean; readonly asynchronous: boolean };
  readonly idempotencyRetentionSeconds: number;                     // ADR-030; > 0
}

export interface PaymentProviderBinding {
  readonly id: string;                       // scopes paymentId, refundId, operationId, eventId and idempotency keys
  readonly capabilities: PaymentCapabilities;
  readonly provider: PaymentProvider;
  readonly status?: PaymentStatusProvider;
  readonly capture?: PaymentCaptureProvider;
  readonly cancel?: PaymentCancelProvider;
  readonly operations?: PaymentOperationLookup;
  readonly refund?: PaymentRefundProvider;   // ADR-031
  readonly notifications?: PaymentNotificationVerifier;
}

export declare function validatePaymentProviderBinding(b: PaymentProviderBinding): Result<void, PaymentError>; // "invalid_configuration"
```

The payment service token resolves the **binding**. The pure validator runs at composition and returns every violated rule. A binding that violates any rule
**cannot be composed**. The rules are:

| Rule | Condition | Rationale |
|---|---|---|
| C-1 | Each declared capability matches port presence: `statusLookup ⇔ status`, `notifications ⇔ notifications`, `operationLookup ⇔ operations`, `manualCapture ≠ false ⇔ capture`, `cancel ≠ false ⇔ cancel`, `refund ≠ false ⇔ refund` | The declaration is truthful |
| C-2 | `asynchronousInitiation ⇒ statusLookup` | Notifications alone are not reliable because they can be missed permanently; lookup is the completion backstop |
| C-3 | `customerActions` non-empty ⇒ `asynchronousInitiation` | An action implies a non-terminal state |
| C-4 | `manualCapture.asynchronous` or `cancel.asynchronous` ⇒ `operationLookup` | Payment-level lookup cannot, in general, tell a pending operation from a failed one. Notifications alone can be missed. Operation-level lookup is the minimum reliable mechanism. **Notifications are optional**, a latency optimization |
| C-5 | `manualCapture ≠ false ⇒ cancel.authorized` | Without void, a cancelled order keeps the customer's funds on hold until the authorization expires |
| C-6 | `refund.multiple ⇒ refund.partial` | Several refunds of one payment are necessarily partial |
| C-7 | `refund.asynchronous` imposes no further rule | `retrieveRefund` is a mandatory method of the refund port (ADR-031) |
| C-8 | `idempotencyRetentionSeconds > 0` | ADR-030: a provider without native idempotency cannot implement `PaymentProvider` |
| C-9 | `customerActions` ⊆ `PaymentAction["kind"]` | Closed union |
| C-10 | A `PaymentOperationOutcome` with status `pending` carries `operationId`, and every `operation` notification carries `operationId` (conformance rule, checked by the adapter conformance suite) | Without an identity an operation can neither be looked up nor correlated |

**Why asynchronous operations need a reliable completion mechanism.** Looking up only the payment state answers "has the effect happened?", and only while no
other operation is in flight. A pending capture and a failed capture both leave the payment `authorized`. A failed capture followed by a later successful
capture, or later refunds, hide what happened to the earlier operation. Therefore:

- **Synchronous capture and cancel** (results only `succeeded` or `failed`) need no operation lookup. An unknown outcome is resolved by same-key replay
  within the retention window (ADR-030). After that window the replay is **forbidden**; payment-level state decides whether the effect happened.
- **Asynchronous capture or cancel** requires `operationLookup` (C-4) and an `operationId` on every pending result (C-10).
- **An asynchronous operation without a reliable completion mechanism is unsupported.** An adapter that cannot provide both must declare the operation
  synchronous-only, or not declare it at all. An adapter MAY implement `retrieveOperation` on top of a provider's live same-key replay only if that replay
  reflects the current operation status; this is an adapter-conformance claim that MUST be documented.
- **Refunds** satisfy the same principle: `retrieveRefund` is an operation-level lookup and is mandatory in the refund port. **Initiation** relies on
  payment-level lookup (C-2): sufficient, because the initiation is the payment.

**Request-time detection.** A request that uses an undeclared option returns `PaymentError("invalid_request")` with cause `unsupported` (examples:
`capture: "manual"` without manual capture; a partial refund without `refund.partial`; a second refund without `refund.multiple`). The application checks
the descriptor first; the adapter check is the backstop. The application asserts its own requirements against the descriptor at composition; no
requirement-matching API is added.

### 6. Payment-attempt resolution and the one-unresolved-attempt invariant (P5)

**Classification.** P5 is an **application orchestration invariant**, enforced through a **guarantee of the application-owned attempt store**. It is **not**
a Payment-domain invariant (Payment holds no state) and **not** an Order invariant (Order has no attempt concept). It MUST NOT be moved into the Payment
domain contract. ADR-030 carries the caller obligation; this ADR carries the lifecycle and the resolution rules.

**Invariant.** At most one unresolved payment attempt exists per Order. A new attempt for `(tenant, OrderId)` may be created only when **every** existing
attempt for that Order is in resolution class `failed`.

The attempt-resolution **class** is `open`, `succeeded` or `failed`. These are classes of the **attempt**, not operation statuses and not payment states.

| Attempt status | Class | Entered on | Left on |
|---|---|---|---|
| `created` | open | Record inserted **before** the PSP call | The initiation result; if a crash leaves it here the reconciler treats it as `unknown` after a threshold |
| `requires_action` | open | Initiation, replay or `retrieve` result | An authoritative settled result, or a `cancel` operation that `succeeded` |
| `pending` | open | Initiation, replay or `retrieve` result | An authoritative settled result |
| `unknown` | open | Local timeout; `internal_error`; `idempotency_conflict`/`in_progress`; a crash between the call and recording the result | Same-key replay **within retention**; `retrieve(paymentId)`; or attributed manual reconciliation |
| `anomaly` | open | A provider-confirmed success whose financial data cannot be represented or validated (§8b); a currency mismatch on an incoming fact (§8). Recorded on an **open** attempt, or on the **operation record** of a capture or refund, in which case the owning attempt is **held**: no confirmation and no new attempt | **Attributed manual reconciliation only.** Never automatic replay, retry or lookup-driven resolution. Distinct from `unknown` (outcome undetermined) and from the terminal classes |
| `authorized`, automatic capture | open | Settled `authorized` observed | `captured`, `failed` or `cancelled` observed |
| `authorized`, manual capture | succeeded | Settled `authorized` observed | (capture and cancel continue on the same attempt) |
| `captured` | succeeded | Settled `captured` observed | terminal |
| `failed` / `cancelled` | **failed** | Settled `failed` / `cancelled` observed | terminal |

Note on naming: a **successful cancellation** (cancel operation status `succeeded`) yields payment state `cancelled`, which is a **terminal attempt
status `cancelled` of class `failed`**: the attempt did not produce a paid order. The word "failed" in the class means "no money was taken", not that
anything went wrong.

**Authoritative results that may resolve an attempt:** an initiation result or same-key replay reporting a settled state; a lookup result; a verified
notification; a capture or cancel operation result with status `succeeded` (a capture result moves the attempt to `captured` only when it is fact evidence under §2, "Capture success semantics"); an **attributed** manual reconciliation entry (who, when, provider evidence).

**None of the following resolves an attempt:**

- a local timeout;
- a `PaymentError` of reason `internal_error`, or `idempotency_conflict` with cause `in_progress`;
- a customer redirect return or client callback;
- elapsed time, including order expiry;
- an Order status change, including order cancellation;
- an unverified notification;
- a same-key replay **after** the provider's idempotency retention window (forbidden: the provider may have forgotten the key and would create a new payment).

An unknown provider outcome remains unresolved until an authoritative result is obtained. A local timeout is never evidence that the provider-side payment
failed.

Transitions are monotonic: `open → succeeded | failed`, and a terminal class never reopens. A verified contradiction of a terminal class (for example
`captured` observed for an attempt of class `failed`) is an **anomaly**: record, hold, alert and handle manually. It is never auto-resolved.

**Responsibilities.**

| Responsibility | Owner |
|---|---|
| Create the attempt record **before** the PSP call; derive keys; classify results; apply the stale-drop and anomaly rules (§8) | Application |
| Atomic conditional create (A1) and the other guarantees below | **Persistence adapter** of the attempt store |
| Report states honestly; provide lookups required by the capability rules | Provider adapter |
| Define the vocabulary, the ports and the rules | Payment contract (this ADR) |

**Minimum guarantees required of a future attempt-store adapter.** They are requirements on an application-owned store; Comity provides no such store.

| # | Guarantee |
|---|---|
| A1 | **Atomic conditional create.** Insert an attempt for `(tenant, OrderId)` only if no attempt for that Order is in class `open` or `succeeded`, as one atomic operation (for example a unique constraint over non-`failed` rows, or a per-order slot updated by compare-and-set). Of two concurrent creates exactly one succeeds; the loser receives a conflict and returns the existing attempt. |
| A2 | Version-checked status updates (ADR-029 / C1 semantics) whose predicate also enforces monotonic class transitions |
| A3 | The record exists before the PSP call. A crash leaves `created` (open), never "no record" |
| A4 | Uniqueness of `PaymentAttemptId`, of `(binding, idempotencyKey)` across all operation records, and of `(binding, paymentId)`; each provider-assigned identifier (`paymentId`, `operationId`, `refundId`) is set atomically if-absent **on the record of the one operation it identifies**, and is unique per binding. Several operation records, of the same or of different types, may exist for one attempt (§4 rule 2a) |

**How P5 resists bypass.** A timeout leaves the attempt `unknown` (open), so A1 rejects a new attempt. Concurrent checkout requests are serialized by A1.
A retry of the same request reuses the same `PaymentAttemptId` and therefore the same key, so the provider replays. No cross-store transaction is required:
write ordering plus reconciliation makes every intermediate state recoverable. In-memory stores and the advisory `version` of Order provide none of these
guarantees across processes.

**Consequence for customer retry.** After an abandoned redirect, a new attempt is possible only if the provider can cancel incomplete payments
(`cancel.incomplete`) or expires them on a bounded, observable schedule. This is a PSP selection criterion.

### 7. Notifications, webhooks and reconciliation

**Verification boundary.** Signature verification, secrets, timestamp tolerance and payload parsing belong to the **provider adapter**, behind
`PaymentNotificationVerifier`. The Core package defines only the port and the normalized output; it contains no cryptography, no secrets and no HTTP
framework types. The application's HTTP layer passes the **raw bytes and headers** through unchanged, because signatures cover raw bytes.

**Delivery guarantees are an unresolved external dependency.** No PSP is selected. The following are therefore **assumptions, not verified facts**, and
MUST be verified against the selected PSP before the direct strategy is adopted:

| # | Required PSP guarantee |
|---|---|
| W-1 | Redelivery on non-2xx for a period longer than the reconciliation interval |
| W-2 | The endpoint is not permanently disabled after the failure rate the direct approach may produce, **or** disabling is detectable and alerting |
| W-3 | Processing (verify, correlate, apply, save) completes within the PSP's response timeout |
| W-4 | Status lookup for payments **and** refunds, and operation lookup for any capture or cancel executed asynchronously (C-2, C-4, ADR-031) |
| W-5 | All money movements are application-originated (see §9) |
| W-6 | ADR-029 (C1) is accepted and a conforming Order repository exists |
| W-7 | The reconciliation interval is shorter than the order-expiry window |

**Strategies compared** (A = direct processing with idempotent Order updates and provider retries; B = A plus mandatory periodic reconciliation; C = durable
inbox, acknowledged on insert and processed asynchronously):

- A alone is inadequate: a provider that stops retrying, or a permanently missed webhook, loses the event.
- **An inbox does not recover events that never arrived.** It adds decoupled acknowledgement, an audit trail, replay after a processing bug and
  serialization of duplicate deliveries (unique `(binding, eventId)`). Only reconciliation recovers a missed event, and only for operations the application
  knows about.
- **Decision (conditional).** Direct processing with **mandatory reconciliation** (B) is adopted **only if W-1 to W-4 are verified** for the selected PSP.
  A durable inbox (C), with reconciliation kept, is the fallback when verified guarantees are insufficient. The final choice is therefore **conditional on
  PSP verification** and is not made by this ADR.
- **Conditions that force a durable inbox:** W-1 fails; W-2 disabling is not detectable; W-3 cannot be met; or the business requires audited processing or
  replay of provider-originated events.
- **A PSP without adequate lookup for the relevant payment and refund operations (W-4) is incompatible** with the recovery model. An inbox does not remove
  this requirement, because an inbox cannot store what never arrived.

**Direct processing procedure.** The handler verifies the delivery, correlates it (§4), applies it to the Order with a version check (ADR-029), and
acknowledges with 2xx only after the save succeeded or when the event is a recognised no-op or stale. Any processing failure returns non-2xx.

**Reconciliation** runs on a schedule and on demand over: every **open** payment attempt older than a threshold; every capture or cancel operation still
`pending` (via `retrieveOperation`); every refund attempt in `pending` (via `retrieveRefund`). Results are applied through the A2 guarantee, and settled
facts are attached to the Order under §8.

- **Reconciliation recovers:** the final state of application-originated payments (by `paymentId`, or by same-key replay within retention); refunds (by
  `refundId`, or by replay); asynchronous capture and cancel operations (by `operationId`).
- **Reconciliation cannot recover:** provider-originated events (dashboard refunds, captures or cancels, disputes, chargebacks, payments created outside the
  application); attempts whose `paymentId` was never observed once the key retention has expired (manual reconciliation; lookup by reference is
  **deferred**); and a delivery audit trail (only an inbox provides one).

ADR-016 (event publication reliability, Proposed) is **not** modified. The inbox is an application choice; the Payment contract needs no ADR-016 decision.
No outbox or Unit of Work is required by this ADR.

### 8. Payment facts on the Order and financial invariants

**Mapping (application-owned).** `SettledPaymentOutcome`-shaped results and `payment` notifications map field-by-field to `OrderPaymentSnapshot`:
`paymentId`, `amount`, `status` (same four literals), `provider`, `reference` (= `PaymentAttemptId`), `authorizedAt`, `capturedAt`. `pending` and
`requires_action` are not mapped. The Order does not depend on Payment or on any adapter (ADR-013).

**Application rules for Order facts.** Before attaching, inspect the Order's recorded facts for that `paymentId`. Exactly one applies:

- **Never attach a fact without `paymentId`.** `failed`/`cancelled` results without an id are recorded on the attempt only.
- **Stale-drop:** the incoming status is `authorized` and a terminal fact is already recorded. Log and acknowledge; do not attach.
- **Anomaly:** the incoming status is terminal and differs from an already recorded terminal fact (for example `failed` after `captured`), or repeats a
  recorded status with a different amount. Trigger a lookup and an alert, acknowledge the delivery, do not attach.
- Otherwise attach. An identical repeat is an Order no-op. `payment_fact_conflict` is not the detection mechanism for staleness or anomalies, because it
  does not say which case occurred.
- `attachPayment` is legal in any Order status. Checkout applications submit the Order (`draft → pending`) before initiating a payment, and attach facts
  only after submission. A late `captured` for a cancelled Order is attached so that money is recorded, followed by an explicit refund-or-reinstate
  decision; the Order is never reopened automatically.

**Financial invariants (first-store flow).**

| # | Rule | Enforced by |
|---|---|---|
| F-1 | Payment currency equals the Order currency: compare currency `code` **and** `exponent` (the Order holds a structural `PriceCurrency`, so `Money.equals` cannot be used against it) | Application, before attaching |
| F-2 | The requested amount equals the Order total (`price.total`, Order currency) at initiation | Application, before `initiate` |
| F-3 | Confirmation only when the sum of `captured` facts for the Order (same currency) equals the Order total exactly **and** the Order is `pending` | Application (confirm-once guard plus ADR-029) |
| F-4 | Refunds never change the Order total or status; the outstanding balance is derived | Application, and Order reversal rules (deferred) |
| F-5 | No mismatch ever causes automatic confirmation or fulfillment | Application |

**Mismatches are held and alerted**, never auto-resolved: currency mismatch (do not attach; mark the attempt as anomaly); under-capture (do not confirm; do
not auto-retry a charge); over-capture or two captured attempts (do not confirm automatically; a refund of the excess needs an explicit decision);
late capture for a cancelled Order (attach, then decide); a provider-confirmed success whose financial data is unrepresentable (§8b). Partial captures are unsupported in v1.

**Constructing `Money`: see §8a.** **Provider minor-unit conventions** are the responsibility of the Payment technology adapter, not of the amount factory:

- The amount factory takes two scalar inputs (provider minor units as a `bigint`, and an ISO 4217 currency code), is synchronous, builds Pricing values
  with the public `Currency.create` and `Money.create`, and returns the **original Pricing error** unchanged. It knows nothing about any provider's amount
  convention.
- The adapter obtains the provider's convention from **static, integration-specific configuration or metadata** and validates compatibility with the
  supported currencies **at composition/setup time**. An unsupported provider/currency combination **fails setup** (`invalid_configuration`) instead of
  producing incorrect amounts.
- Any conversion to the minor units of the Pricing currency uses **exact integer arithmetic only**: no rounding and no truncation.
- The adapter validates the provider's representation (an integer within safe range, non-negative, a currency within the validated set) **before** passing
  minor units to the factory. A response that fails these checks, or that the factory rejects, is financial data that cannot be represented (§8b or the
  unknown-outcome rules, according to what the provider confirmed).
- No generic currency-metadata framework is introduced.

### 8a. Payment adapter dependency boundary (OD-F4, owner-approved)

Rules for every **Payment technology adapter** (a Technology Adapter that implements `@comity/payment`, including refunds):

1. A Payment technology adapter **MUST NOT depend on `@comity/pricing` at runtime.**
2. **Type-only** dependencies on `@comity/pricing` remain permitted, **subject to the existing Comity layering rules**. This ADR neither widens nor narrows them.
3. Pricing value objects that an adapter implementation must produce (for example the `Money` of a `PaymentOutcome`, `PaymentOperationOutcome`,
   `RefundOutcome` or notification) are constructed through a **factory injected into the adapter** at the **composition boundary**.
4. The factory is **implemented at the composition boundary** (application wiring, ADR-025) using the public `Currency.create` and `Money.create` APIs.
5. The adapter **consumes** the injected factory. It MUST NOT import Pricing at runtime, and MUST NOT duplicate, reimplement or bypass Pricing
   value-object construction (no internal constructors, no duplicate `Money` type).
6. The factory is **not** a Payment domain concept and **not** a second implementation of Pricing: it only delegates to the public Pricing APIs. This ADR
   prescribes **no factory interface, method names or package layout**; those are implementation matters.
7. This is **not** a general exception: it does not allow technology adapters to import arbitrary Core Modules, and it does not amend ADR-008. The
   `payment → pricing` edge stays **type-only**, and no dependency edge is added or changed.
8. This rule changes no lifecycle semantics, capability rule, identifier, idempotency rule, refund behaviour, financial invariant or production gate.

### 8b. Unknown outcome, known non-terminal outcome, confirmed success and confirmed failure with unusable financial data

Four situations MUST NOT be conflated. The adapter classifies by **what the provider authoritatively confirmed**, using its documented provider-state mapping (§2 rule 6). The
letters are stable identifiers used throughout this ADR and the proposal (A unknown, B confirmed success, C confirmed failure, D known non-terminal); they do not express an order.

| | B. Confirmed success | D. Known non-terminal | A. Unknown outcome | C. Confirmed failure or cancellation |
|---|---|---|---|---|
| Provider state known? | **Yes**: settled `authorized` or `captured`; operation or refund status `succeeded` | **Yes**: authoritatively `pending` or `requires_action`; refund or operation `pending` | **No**: timeout, connection loss, ambiguous or contradictory response (including one suggesting money may have moved), missing required identity | **Yes**: payment state `failed` or `cancelled`; operation or refund status `failed` |
| What is wrong | Amount or currency cannot be built or validated | The same, but only for the amount that accompanies a known non-terminal state | The state itself cannot be established | Nothing: any unusable financial field is **non-authoritative** |
| Signal | `unrepresentable_success` (§3). **Never** `internal_error`, **never** a normal outcome | **A normal outcome** carrying the known state, with `providerAmountUnusable: true` (below). **No error**: never `internal_error`, never the anomaly reason | `PaymentError("internal_error")` (§2 rule 1) | The ordinary failed or cancelled outcome. Never `internal_error`, never the anomaly reason |
| Attempt resolved? | **No**: `anomaly` (open, §6) | **No**: stays `requires_action` or `pending` (open), with the unusable amount **recorded** and reported (informational, non-blocking). **No new status** | **No**: `unknown` (open) | Yes: class `failed` (`failed` or `cancelled`) |
| Recovery | Attributed manual reconciliation only; no replay, no automatic resolution | The ordinary mechanisms for a non-terminal state: lookup, notification, reconciliation (§7). No replay is needed or authorized; a new attempt stays blocked by P5 | Same-key replay **within** retention; lookup; attributed manual reconciliation (ADR-030 §6). No replay after retention | None needed |
| Order fact | **None** from the unrepresentable data | **None** (a non-terminal state never yields a fact) | **None** while unknown | `failed`/`cancelled` fact **only** with authoritative failure and a `paymentId`, amount from the persisted request snapshot (below) |
| Confirmation or fulfillment | Not allowed | Not allowed | Not allowed | Not allowed (no `captured` fact exists) |
| Amount requirement | Mandatory and valid, else this case | A valid amount, none, or the flag, on payment and refund outcomes (the same three states as failure); a pending capture may carry a valid amount, none, or the flag; a cancel carries no amount | Not applicable (no outcome is produced) | A valid amount, none supplied, or `providerAmountUnusable: true`, where the outcome carries an amount |

**Classification rules.**

1. Case C requires an **explicit** provider failure under the adapter's documented mapping. A response that mixes failure with indications that money moved, or is
   otherwise contradictory, does **not** establish failure: it is case A (or case B if success is the authoritative part). The adapter MUST NOT downgrade
   uncertainty to failure.
2. Case B requires **authoritative** success. A success-looking response missing a required identity (`paymentId` for `authorized`/`captured`, `refundId` for a
   refund that `succeeded`) does not meet the contract and is case A.
3. For a **confirmed failure**, financial fields returned by the provider are not authoritative and MUST NOT turn the case into `internal_error` or into an
   anomaly. A provider-supplied amount that is unusable MUST NOT be silently discarded or replaced by the requested amount: it is reported with
   `providerAmountUnusable: true`. When the provider supplied **no** amount, the outcome carries none; the requested amount is **never echoed** into it.
4. **Case D is not case A.** A `pending` or `requires_action` state that the provider authoritatively returned is a **known** state. An unusable accompanying amount is a
   financial-data defect, not uncertainty about the state, so it MUST NOT be reported as `internal_error`, MUST NOT be reported as case B, MUST NOT resolve the attempt,
   and MUST NOT authorize a replay or a new attempt. Case A is reserved for states that **cannot be established**.
5. An adapter MUST NOT silently omit or default an unusable returned amount to obtain an outcome, in any case.
6. Case D needs **no new lifecycle state**: the attempt statuses `requires_action` and `pending` already represent the known state, and the unusable amount is recorded as
   data on the attempt, not as a status.

**Outcome amount representation (OD-F9, owner-approved).** `amount` is mandatory and valid on settled success and follows `ReportedAmount` (§3) elsewhere, as the table below
allows. The representation is a **discriminated union**, not two independent optional properties, so contradictory combinations cannot be constructed (the shape is in §3). It
distinguishes exactly three provider responses:

| Provider response | `amount` | `providerAmountUnusable` | Allowed on |
|---|---|---|---|
| A valid amount was supplied | **Present** | **Absent** | Every outcome |
| No amount was supplied | **Absent** | **Absent** | Confirmed failure or cancellation, every known non-terminal payment or refund outcome (`pending`, `requires_action`), and capture operation results |
| An amount was supplied but is unusable | **Absent** | **`true`** | Confirmed failure or cancellation, and every known non-terminal outcome, **only where the outcome carries an amount** (never a cancel). **Never** a success |

Rules:

1. `amount` is **never** present together with `providerAmountUnusable`, and the flag is only ever `true`, never `false`.
2. `providerAmountUnusable: true` means that the provider **actually supplied** an amount and it could not be represented or validated. An absent amount **without** the flag
   means only that the provider supplied none. A consumer therefore cannot infer that an unusable amount was never supplied.
3. The flag is **not** used for caller errors (`invalid_request`), unknown outcomes (`internal_error`) or ordinary malformed or unverified notifications
   (`invalid_notification`).
4. Zero is a valid `Money`. It is **present**, never confused with an absent amount or with the flag. A zero that violates F-2 or F-3 is a §8 mismatch, not an unusable amount.
5. The mandatory amount is **not weakened**: settled success (`authorized`, `captured`, refund `succeeded`) always requires a valid amount; an unusable one makes it case B. A known non-terminal payment or refund outcome carries a valid reported amount, none (when none was supplied) or the flag;
   the requested amount is never substituted. Non-terminal requirements are **operation-specific** (table below); no operation is required to return an amount its contract does not define. For **capture**
   operation results, where `amount` is already optional, the flag reports an unusable returned amount on a `pending` or `failed` capture, and an unusable amount on a
   `succeeded` capture is case B. A `succeeded` capture without an amount does not by itself yield a `captured` fact (§2, "Capture success semantics"). **Cancel** operation results carry no amount and never the flag.
6. The same representation applies to `payment` and `refund` notifications whose state is confirmed failure, and to a non-terminal (`pending`) `refund` notification, so the
   semantics are identical for the `refund` command, `retrieveRefund` and refund notifications. `payment` notifications carry only settled states (non-terminal payment
   events arrive as `other`), and `operation` notifications carry no amount, so case D arises for notifications only on a `pending` `refund` notification.
7. **Amount vocabulary.** *Requested*: what the application sent and persisted. *Expected*: what the application expects to be confirmed (F-2, the full authorized amount for a
   capture, the requested refund amount). *Provider-reported*: an amount the provider supplied on a non-terminal or failed outcome, usable but **not** confirmed.
   *Provider-confirmed*: the amount on an authoritative success, the only amount that can feed an Order fact or a reversal. *Absent, none supplied*: no amount and no flag.
   *Absent, supplied but unusable*: no amount with `providerAmountUnusable: true`. A **requested amount is never echoed into a provider outcome** (payment, operation or refund) and never presented as
   provider-reported or provider-confirmed: the application uses its own persisted request or attempt record.

**Amount requirements by operation** (contract fields as in §3 and ADR-031; the vocabulary is rule 7 above):
to be confirmed; "provider-confirmed" = the amount on an authoritative success, the only amount that can feed an Order fact or a reversal):

| Operation | Non-terminal state | `amount` in the contract | Meaning of a non-terminal amount | Case D representation | Authoritative completion path |
|---|---|---|---|---|---|
| Initiate / `retrieve` | `pending`, `requires_action` | `PaymentOutcome` (OD-F9: the `ReportedAmount` union) | Provider-reported amount of the payment in progress, expected to equal the requested amount (F-2). **Not** provider-confirmed | Valid amount; **none supplied** (absent, no flag); **or** `providerAmountUnusable: true`. The requested amount is **never** echoed in. `authorized` and `captured` still require a valid, provider-confirmed amount | `retrieve(paymentId)`; `payment` notification for settled states; reconciliation |
| Capture / `retrieveOperation` | `pending` | **Optional** (`PaymentOperationOutcome.amount?`) | Provider-reported capture amount, if any; expected to equal the requested (full authorized) amount. **Not** provider-confirmed | Valid amount, none supplied, **or** `providerAmountUnusable: true` (the three-state union). A pending capture is **not** required to return an amount | `retrieveOperation(operationId)` (C-4); then a payment outcome with a valid amount for any `captured` fact |
| Cancel / `retrieveOperation` | `pending` | **Not applicable** (a cancel reports no amount; a `cancelled` payment moves no money) | — | **No amount and no flag.** Unexpected provider data in a cancel response follows the rule "Unexpected financial data in a cancellation response" below: it is ignored **only** if it has no financial meaning | `retrieveOperation(operationId)` (C-4); a `cancelled` fact only after an authoritative cancellation, under the case C fact rules |
| Refund / `retrieveRefund` | `pending` | `RefundOutcome` (OD-F9: the `ReportedAmount` union; `succeeded` keeps a mandatory, valid, provider-confirmed amount) | Provider-reported amount of the refund in progress, expected to equal the requested refund amount. **Not** provider-confirmed | Valid amount; **none supplied**; **or** `providerAmountUnusable: true`. The three states stay distinguishable. The requested amount is **never** echoed into `amount`: `retrieveRefund` and refund notifications give the adapter no request, and persisted attempt state is application-owned (§6) | `retrieveRefund(refundId)` (mandatory, ADR-031); `refund` notification; reconciliation. A **pending refund never creates a reversal** |

In every row a non-terminal outcome **resolves nothing and records no Order fact or reversal**; an unusable amount is recorded on the attempt or operation record and reported.

**Refund success is unchanged.** A `succeeded` refund requires a valid, provider-confirmed amount. A `succeeded` response with no amount, or an unusable one, is case B
(`unrepresentable_success`, `scope: "refund"`), never completed by echoing the requested amount; it records no reversal. Only an authoritative `succeeded` refund with a valid
amount can create a reversal (ADR-031), and `RefundAttemptId` and the `reversalId` relationship are unchanged.

**Unexpected financial data in a cancellation response.** A cancel reports no amount, but a provider response may carry other fields. They are classified by the adapter's
**documented provider mapping** (static, per adapter; §2 rule 6), in two categories:

1. **Irrelevant or non-authoritative metadata**: informational fields with no financial meaning that do not contradict the cancellation state. These MAY be ignored, and only when
   the adapter's documented mapping establishes that they have no financial meaning.
2. **Evidence of a financial movement or a contradictory outcome**: a response indicating that an amount was captured, charged, refunded or otherwise moved despite the
   cancellation result, or a state inconsistent with a cancellation. This MUST NOT be silently ignored. The existing cases apply, and no cancellation-specific state or error reason
   is introduced:
   - if the authoritative outcome **cannot be established** (for example a response reporting the cancel as `succeeded` together with evidence of capture): **case A**,
     `internal_error`; the cancel operation is `unknown`;
   - if the cancel **did not take effect because the payment had already progressed** (for example captured): the ordinary cancel operation status `failed` (§3.4). The mandatory
     `retrieve` that follows surfaces the payment state and its amount: a valid amount follows the ordinary captured-fact and late-capture rules (§8); an unusable one is
     **case B** (`unrepresentable_success`, `scope: "payment"`, with the `paymentId`), held as an `anomaly` on the payment attempt;
   - if the response **itself** authoritatively establishes a financial movement whose data is unrepresentable: **case B**, `scope: "payment"`;
   - if a financial movement is established and its data is valid: the existing operation and Order-fact rules apply unchanged.

An adapter MUST NOT report a cancel as `succeeded` when its response contains category 2 evidence. Which fields of a given provider's cancel response carry financial meaning is
**PSP-dependent** and is part of that adapter's documented mapping; it is not decided here.

**Order facts for case C.** A `failed` or `cancelled` fact moves no money and does not affect F-3 (which sums `captured` facts only). It is recorded only when the provider
outcome is **authoritative** (confirmed failure) **and** a `paymentId` exists (§8). Its amount is taken from the application's **persisted request snapshot** (the amount
the attempt was created with, F-2), never from an untrusted or unrepresentable provider amount. This is the existing `OrderPaymentSnapshot` shape (`amount: Money`)
with the application's own representable value, and it keeps repeated facts consistent under the Order's same-amount rule for a given `(paymentId, status)`. If a
provider-supplied amount was unusable (`providerAmountUnusable`), that is recorded on the attempt and reported (informational, non-blocking); it does not block the
failure. Without a `paymentId`, or without a safe snapshot, the outcome is recorded on the attempt only and **no Order fact is manufactured**. A **refund failure never
creates a reversal** (only a `succeeded` refund does, ADR-031).

**Required behaviour for case B** (it follows from F-5 and the mismatch handling of §8):

1. The adapter MUST NOT produce a normal successful outcome, and MUST NOT fabricate or default an amount.
2. The application MUST NOT record an Order payment fact from the unrepresentable data, and MUST NOT confirm or fulfill the Order on the basis of that response.
3. The application MUST **hold and alert**, and mark the attempt or operation record `anomaly` (§6). P5 keeps blocking new attempts for the Order.
4. The case MUST NOT enter unknown-outcome handling: **no automatic same-key replay or retry** merely because the adapter could not construct its financial result,
   and no automatic reconciliation resolution. A reconciler skips `anomaly` records and only alerts.
5. Resolution is **attributed manual reconciliation** (who, when, provider evidence). It needs no replay: the provider identifiers recorded with the anomaly identify
   the provider-side object. If reconciliation later establishes valid financial data, the normal application rules apply from that point (for a refund,
   `reversalId` stays the `RefundAttemptId`).
6. Only after signature or authenticity verification may an adapter raise the case B signal: a delivery that fails authenticity is `invalid_notification`.

**Operation matrix** (what constitutes authoritative success, which financial fields matter, and what is anomalous):

| Operation | Authoritative success | Financial fields that must be constructible and valid | Case B applies | Record marked `anomaly` | Identifiers recorded with the anomaly |
|---|---|---|---|---|---|
| Initiate (and `retrieve`) | State `authorized` or `captured`, with `paymentId` | `amount` (and its currency) | Yes | The payment attempt | `paymentId` (mandatory), `reference` when echoed |
| Capture | Operation status `succeeded` | `amount`, **when the provider returns one**. An unusable returned amount MUST NOT be silently omitted | Yes, only if an amount was returned and is unusable | The capture **operation record**; the owning attempt is **held** (no confirmation, no new attempt) | `paymentId`; `operationId` when returned |
| Cancel | Operation status `succeeded` (payment now `cancelled`) | None: a cancel reports no amount, and a `cancelled` payment moves no money | **No**, for the contract's own fields: a cancel reports no amount. Unexpected financial data is handled by the rule below, never silently ignored | — | — |
| Refund | Operation status `succeeded`, with `refundId` | `amount` (required on `RefundOutcome`) | Yes | The **refund attempt** (`RefundAttemptId`); no reversal is recorded | `paymentId`, `refundId` (mandatory), `reference` when echoed |

The refund identity and reversal rules of ADR-031 are unchanged: the anomaly records no reversal and consumes no new `RefundAttemptId`.

**Notifications and batched deliveries.** `verify` returns **one `Result` per delivery**, not per event. A verified delivery that contains a case B event therefore fails
as a whole; the contract cannot return its valid siblings separately and does not pretend to. The limitation is stated, and the following **application-side**
guarantees make it safe without a new abstraction. Whether a selected PSP batches events per delivery is PSP-dependent and unverified.

1. **Whole-delivery retention.** The application durably retains the **entire raw delivery** (original bytes, headers, receipt time, the provider binding it arrived on) in
   a retention record with its own application-assigned identity. This is not an inbox and does not normalize events.
2. **Event identity and tracking.** The offending event's `eventId` and correlation (below) are recorded on the retention record and on the `anomaly` record. Because the
   delivery cannot be normalized as a whole, sibling events are identified and dispositioned during **attributed manual review** of the retained delivery; the review
   records each event's disposition (applied, recovered by lookup, not applicable) with who and when.
3. **Siblings are not abandoned.** Siblings that concern **application-originated** operations leave their attempts or operation records **open**, so reconciliation
   resolves them by lookup (`retrieve`, `retrieveOperation`, `retrieveRefund`) without depending on the delivery. Other siblings remain available in the retained
   delivery for manual handling.
4. **Safe reprocessing.** Anything applied later passes through the ordinary rules, which are idempotent: Order facts deduplicate on `(paymentId, status)`; capture and
   cancel operation records have state guards; a reversal's `reversalId` is the `RefundAttemptId` (ADR-031). Reprocessing duplicates no Order fact, operation result or
   reversal.
5. **No silent discard.** The invalid event is recorded as an `anomaly`, alerted, and retained; it is never dropped after acknowledging.
6. **Acknowledgement.** The delivery MAY be acknowledged with 2xx **only after** the raw delivery is durably retained **and** the anomaly is recorded. Acknowledgement means
   the delivery is safely held, **not** that every event in it was processed. If retention or anomaly recording fails, the delivery is **not acknowledged**
   (non-2xx), per the direct-processing rule of §7 ("acknowledge only after the save succeeded; any processing failure returns non-2xx"). If the offending event
   **cannot be correlated**, the delivery is not acknowledged (direct strategy) or parked (inbox strategy), as ADR-031 §6 and §4 rule 4 require for uncorrelatable
   notifications; the raw delivery is retained in both cases.
7. **Recoverable versus unrecoverable events.** Events concerning application-originated operations are recoverable by lookup. **Provider-originated** events (dashboard
   refunds, captures or cancels, disputes, chargebacks) are **not** reconstructible by lookup: for them, and for events whose `paymentId` was **never observed**, only the
   retained delivery and attributed manual handling remain. An inbox does not remove this limitation.
8. **Per-event `verify` results are not required.** The guarantees above meet the safety requirements (no silent loss, no invalid fact). A per-event result would only add
   automation for siblings; it becomes an owner decision solely if the selected PSP batches events **and** provider-originated events matter (open question 3).

**Correlation of a case B anomaly: exact record, binding and identifiers.** The typed details approved in OD-F9 (`provider`, `scope`, provider identifiers, `eventId`,
`reference`) identify exactly one binding and one application record. Commands and lookups are additionally correlated by the **call context**: the caller persisted the
operation record (with its idempotency key) before the call and knows which record it was resolving.

| Path | Mandatory in the details | Application record identified |
|---|---|---|
| Initiate / `retrieve` (`scope: "payment"`) | `provider`, `paymentId` | The `PaymentAttempt`, by `(provider, paymentId)` or the call context |
| Capture (`scope: "capture"`) | `provider`, `paymentId`; `operationId` when the provider returned one | The capture **operation record** (by call context, or `(provider, operationId)`); its record carries the owning `PaymentAttemptId` |
| Cancel | not applicable (B cannot arise) | — |
| Refund (`scope: "refund"`) | `provider`, `paymentId`, `refundId` | The **refund attempt** by `(provider, refundId)` or the call context; the **owning PaymentAttempt** by `(provider, paymentId)` |
| Verified notification | `provider`, `eventId`, `scope`, plus the identifiers of its scope: `paymentId` (payment); `paymentId` and `operationId` (capture; every `operation` notification carries `operationId`, C-10); `paymentId` and `refundId` (refund) | The same records as above. If no record matches, the event is **uncorrelated**: handled under rule 6, never dropped |

`reference` (`PaymentAttemptId` or `RefundAttemptId`) is a **documented fallback**, used only when the authoritative provider identifier is not available, never as a
substitute for one that is. `OrderId` is never used as an attempt or provider identifier, and there is no single operation-id slot per attempt (§4 rule 2a).

**`internal_error` keeps exactly its present meaning (outcome unknown).** It MUST NOT be reused for case B or for a confirmed failure. Using it for B would send a
known success through unknown-outcome replay handling (§6 `unknown`) and could repeat the operation; using it for C would invent an unknown outcome.

**Signalling gap.** The current error reasons cannot express case B unambiguously: `internal_error` is reserved for unknown outcomes (§2 rule 1),
`invalid_request` means a caller defect, `invalid_notification` means a rejected delivery, and the `details` type admits only `reference`. Consumers branch
on `reason` (`errors.md` §4.2), so an implicit convention in metadata is not acceptable. How an adapter signals case B therefore requires a contract
extension, which is an open question below. The behaviour required above is independent of that extension.

### 9. The application controls all money movements

Initiation, capture, cancel and refund MUST be initiated and controlled through the application layer. Dashboard-originated refunds, captures and cancels
are operationally forbidden, and disputes are out of scope (deferred). This is what makes reconciliation complete for the operations Comity can recover.

### 10. Production gates

Nothing in this ADR is implemented by being Proposed or even Accepted.

| Gate | Blocks |
|---|---|
| **C1 (ADR-029)** accepted and a conforming adapter exists | Any production persisted write of payment facts, attempts or reversals |
| **C3 (ADR-030)** accepted and implemented | Any production `initiate` |
| **C4 (ADR-031)** accepted and implemented | Refund execution, `Order.recordReversal`, and retail general availability (Commerce limitation L-7: do not work around) |
| PSP verification of W-1 to W-4 and native idempotency retention | Choosing direct processing over an inbox; any production use |

Acceptance of this ADR together with ADR-030 and ADR-031 is required **before implementation** of any Payment contract change. The gates above apply
separately **before production use**.

## Alternatives considered

| Alternative | Reason rejected |
|---|---|
| A Payment aggregate or ledger in Comity | Duplicates provider truth Comity cannot keep consistent; no consumer needs a shared ledger |
| Add `pending`/`requires_action` to `OrderPaymentStatus` | They are observations, not facts; would reopen the owner-confirmed Order progression |
| One status vocabulary for payments and operations | `pending` and `failed` mean different things for a payment and for a command; conflation makes cancellation ambiguous |
| Capability inferred from interface presence | Not observable through a typed token; cannot express parameter-level or asynchronous properties |
| Runtime feature probes or a plugin framework | Elaborate; a static descriptor plus a pure validator is the smallest model that makes unsupported combinations detectable |
| Universal webhook requirement for asynchronous capture/cancel | Notifications can be missed permanently; operation lookup is the reliable mechanism |
| Splitting this ADR into three | Async initiation without lookup leaves `pending` unresolvable; async capture without operation lookup is unsupported; the descriptor has no meaning without these ports |
| Mandating a durable inbox | An inbox recovers nothing that never arrived; it is justified only when PSP guarantees fail |
| Mandating direct processing | PSP guarantees are unverified; the choice must remain conditional |
| Sending `OrderId` as the payment reference | The `OrderId` is reused across attempts, cannot distinguish them and says nothing about attempt resolution |
| An order-level `reference` field | Not demonstrably necessary; `OrderId` and per-fact `reference` suffice |
| Putting P5 in the Payment or Order domain | Both are stateless with respect to attempts; P5 is an orchestration invariant needing store atomicity |

## Consequences

**Positive:** asynchronous providers are expressible without weakening the Order fact vocabulary; unsupported adapters fail at composition; identifiers have
one meaning each; double charge after an unknown outcome is prevented by an explicit store guarantee; recovery claims are honest.

**Negative:** breaking changes to `PaymentRequest` and `PaymentOutcome` (0.x minor with a migration note); more ports; every adapter documents a state
mapping and satisfies a conformance suite; the application must build an attempt store with A1–A4; the webhook strategy stays undecided until a PSP is
verified.

## Compatibility and migration

`@comity/payment` is `0.9.x`; the contract changes ship as a minor bump with a migration note. No in-repository consumer imports the contracts. New
`PaymentErrorReason` values are additive (`errors.md` §10). `@comity/order` is unchanged by this ADR. `MemoryPaymentProvider` is to implement every port, the
ADR-030 replay rules and scripted asynchronous transitions deterministically (it remains a test double).

## Affected packages and consumers

`@comity/payment` (contracts, errors, setup binding, `MemoryPaymentProvider`, conformance suite); every future payment Technology Adapter; the Commerce
checkout and refund workflows and the application-owned attempt store. **No ADR-008 edge is added or changed:** payment types use `Money` as a type only.
No new package is introduced.

## Relationship to existing ADRs

- **ADR-030** (revised in place): command idempotency and the P5 caller obligation. ADR-037 defines the lifecycle those rules apply to. The two are accepted
  together or not at all.
- **ADR-031** (revised in place): refund operation, `refundId`, `RefundAttemptId`, notification and reversal-identity rules.
- **ADR-029** (unchanged): version-checked `save`, relied on by A2 and by the Order repository. A production gate.
- **ADR-016** (unchanged): the inbox is an application strategy; no decision is taken here.
- **ADR-008** (unchanged): the `payment → pricing` type-only edge is sufficient.
- **ADR-013 / ADR-032** (unchanged): Order owns its payment snapshots and does not import Payment. ADR-032 Amendment 4 (reversal identity and an optional
  currency guard) is deferred until `recordReversal` is implemented.
- **ADR-020 / ADR-021:** attempt tracking, retries and refunds are application workflows, not Core Module behavior.

## Follow-up contract corrections (not applied by this ADR)

This ADR is consistent with, and assumes, three corrections tracked as follow-up work:

- **CC-1:** `OrderPaymentSnapshot.reference` and Payment `reference` documentation is to say that the value is the caller's `PaymentAttemptId`, not a
  provider identifier.
- **CC-2:** the Commerce normative sentence that payment facts are legal only "after `draft`" is to be corrected to "any status", matching the code.
- **CC-3:** the deferred `OrderReversal` is to carry a stable `reversalId` equal to the refund-attempt identity (ADR-031).

## Unresolved questions

1. **PSP selection and verification** of W-1 to W-4, native idempotency retention, hosted redirect support and cancellation of incomplete payments (or a
   bounded observable expiry). External dependency; decides direct processing versus an inbox.
2. **Adapter dependency on `@comity/pricing`: resolved** by §8a (injected factory; no runtime Pricing dependency in Payment technology adapters).
3. **Signalling of confirmed success with unrepresentable financial data (§8b): resolved by OD-F9** (owner-approved): the `unrepresentable_success` reason with typed details, and the
   `ReportedAmount` representation with the no-echo rule for payment, operation and refund outcomes (§3). Remaining and PSP-dependent: whether a per-event `verify` result is needed
   (only if the selected PSP batches events **and** provider-originated events matter), whether PSP lookups return amounts for non-terminal payments and refunds, and which fields of
   a provider's cancel response carry financial meaning.
4. **Order-level currency guard** on `attachPayment`: optional, deferred to ADR-032 Amendment 4. Until then F-1 is an application rule.
5. **Deferred capabilities:** manual capture beyond a single full capture, partial or multiple captures, lookup by reference, embedded client-SDK actions,
   normalized decline and refund failure reasons, disputes and chargebacks, saved methods, recurring and merchant-initiated payments, multi-provider routing.
