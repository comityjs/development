# ADR-032 — `@comity/order` Aggregate Extension for the Commerce Foundation (Phase A)

> **Provenance:**
> - Canonical owner: comity-development
> - Runtime owner: comity-community (`@comity/order`)
> - Raised by: Commerce Foundation v0, Phase A (`commerce/docs/architecture/`, frozen 2026-11-04)
> - **Accepted:** 2026-11-05, by architecture-owner decision. Accepted **as written**: the seven-item change set (§1),
>   the five new error reasons (§2), the payment-fact progression (§3), the contract-only `version` (§4) and the exclusions
>   (§5). Acceptance is recorded against this document only; it does **not** accept or implement ADR-029/030/031, create a
>   Commerce package, authorise any publication, or complete the Commerce Phase A authorization record (the DESIGN.md and
>   Community-review gates are recorded there and in `comity-community/packages/order/docs/design.md`).
> - **Amended after acceptance (2026-11-05, Amendment 1).** Architecture-owner decisions **OD-6** (`PriceCurrency`),
>   **OD-7** (atomic `setPricedContent`) and **OD-9** (pricing semantics identifiers) change §1 item 5, add §1 items 8 and 9,
>   and amend the Consequences and Compatibility sections. The acceptance recorded above stands as acceptance of the text **as
>   it stood on 2026-11-05**; this amendment records later-approved decisions and is **not** a new acceptance record. The
>   maintainer confirmed on 2026-11-06, in the decision recorded for this governance closure, that the existing acceptance
>   covers Amendments 2 and 3 and that no separate fresh acceptance record is required. See Open Question 7.
> - **Owner decisions OD-8, OD-10 and OD-11 approved (2026-11-05).** Open questions 4, 5 and 6 are **closed** by them:
>   OD-8 approves the narrow `order → pricing` runtime value import (recorded as ADR-008 "Amendment 1"; **formally
>   incorporated 2026-11-06** — see Amendment 2 below); OD-10 approves `historicalInputs()` as the record accessor name
>   with its contract now normative (ADR-014 §14.4); OD-11 approves abandoning and re-creating drafts whose currency is
>   inactive or unsupported (ADR-014 §13.1). **None of these is an acceptance of this ADR**, and none alters its status.
> - **Amended 2026-11-06 (Amendment 2).** Owner-approved decisions **AM-5a…AM-5d** are recorded in **§2A**: `create`
>   validates a supplied record by exact commitment equality against `combine`, `setPricedContent` derives and replaces
>   atomically, `submit` re-derives and enforces current-semantics eligibility, and priced-path Pricing failures map to
>   `currency_mismatch`/`price_incoherent`. This amendment also records **OD-8's formal incorporation (2026-11-06)**
>   (ADR-008 register: **Value**, `importKind: "value"`, category `"value-import"`). It does not change the acceptance
>   recorded above, which stands for the text as it stood on 2026-11-05.
> - **Amended 2026-11-06 (Amendment 3).** Owner acceptance of
>   `commerce/docs/architecture/resolution/order-commerce-boundary-decision.md` (2026-11-06) withdraws §1 item 2's
>   five-kind `OrderLineSubjectSnapshot`, §1 item 3's generic `priceBasis`/`term`, and §3's O-11/`invalid_buyer`
>   requirement; §2's original five-reason count is reconciled to four. The replacement contract is in **§2B**.
>   AM-5a…AM-5d, ADR-008/OD-8 and ADR-014 are unchanged, and the 2026-11-05 acceptance stands for the historical text.
> - **Amendment 4 — ACCEPTED 2026-11-17.** §2C records the Order refund reversal fact (`Order.recordReversal`). It was
>   drafted and approved in stages on 2026-11-17: the architecture owner's decisions **D4-1 … D4-8**, **P-1 … P-5**, the
>   HTTP mapping and the corrective decisions **CD-A … CD-E** are all recorded in §2C with their own provenance. By owner
>   decision **D4-7**, acceptance followed the implementation of `Order.recordReversal` in Community `@comity/order`.
>   At the time of acceptance that implementation exists in the Community working tree (HEAD `038ed65`, changes
>   **uncommitted and unreleased**), and an independent review of it was reported by the architecture owner (findings F-2,
>   F-3 and F-4; reviewer identity and review date are not recorded here). **Formal acceptance was authorized by the
>   architecture owner in the closure work package of 2026-11-17 and was made on that date**, after the verification
>   recorded in §2C.I. This acceptance covers Amendment 4 only: the base acceptance of 2026-11-05 and the maintainer's
>   confirmation for Amendments 2 and 3 are unchanged, and nothing here accepts, modifies or implements ADR-029, ADR-030,
>   ADR-031 or ADR-037, satisfies Payment Attempt Store gate **G-3** as a whole, or authorises any commit, publication,
>   release or Commerce work.

**Status:** Accepted

## Context

The Commerce Foundation v0 architecture (`commerce/docs/architecture/`, frozen 2026-11-04) is built by **extending the
existing `@comity/order` aggregate in place** rather than introducing a parallel `CommerceOrder` or a universal cart.
`@comity/order` already exists in comity-community, is published (0.9.0, 0.9.1), is governed by **Accepted ADR-013**
(Order is a lifecycle aggregate, snapshots are owned), and sits inside Comity's existing commerce-shaped Core cluster
(`catalog`, `pricing`, `inventory`, `payment`, `storefront`).

The frozen architecture requires a **breaking but minimal** change to this package before any Commerce capability is
built. Because `@comity/order` is a Comity-owned, published Core Module, that change is an **architectural change under
comity governance** (AGENTS.md: a new contract / breaking public API requires an ADR, a DESIGN.md, and explicit review).
This ADR records the decision so the change can be reviewed; the accompanying DESIGN.md
(`comity-community/packages/order/docs/design.md`) specifies the resulting contract in implementation detail.

This ADR authorizes **only** the Order aggregate extension (Commerce "Phase A"). It creates no Commerce package, and it
does not accept or implement the separate Comity prerequisites ADR-029 / ADR-030 / ADR-031.

### Verified repository facts (checked 2026-11-04)

- `@comity/order` 0.9.1: `comity.layer: "core"`; dependencies `@comity/organization`, `@comity/pricing`,
  `@comity/primitives`; `private: false`; published on npm. No package in comity-community imports it; `magento`
  declares a `link:` but has no code import. Its contracts are commerce-shaped (SKU product snapshot, `Price`, channel,
  buyer/address/payment snapshots, cart-as-`draft` lifecycle).
- `Order` constructor performs no validation; quantity/uniqueness checks live only in `setItems`; `update()` replaces
  the price in any status; `attachPayment` appends unconditionally; `cancel()` takes no argument
  (`packages/order/src/entities/order.ts`).
- `OrderErrorReason` today: `invalid_quantity | invalid_item | invalid_status_transition |
  shipping_destination_immutable | ambiguous_shipping_destination | duplicate_item_id`
  (`packages/order/src/errors/order.ts`).
- The status graph `draft → pending → confirmed → fulfilled`, `draft|pending|confirmed → cancelled`
  (`packages/order/src/domain/order-transitions.ts`) is **unchanged** by this ADR.
- `OrderRepository.save` is an unconditional upsert and `RepositoryError` has no `conflict` reason — the gap that
  Proposed **ADR-029** addresses. This ADR does not depend on ADR-029 for the frozen contract; see §4.
- All runtime packages are `0.9.x`, so a breaking change is a **minor** bump (errors.md §10; semver 0.x).

## Problem statement

Fix the aggregate so that, for a commercial commitment, (a) the priced content is coherent from the first write, and
(b) the agreed content cannot change after acceptance — while keeping the change the **smallest** set that the frozen
architecture requires, introducing no concept a consumer does not yet need, and preserving every existing behaviour not
listed below.

## Decision

Extend `@comity/order` in place with the **seven-item change set** below (Commerce AD-16 as amended by FV-01…FV-05;
authoritative source `commerce/docs/architecture/08-typescript-contracts.md` §4 and `12-implementation-roadmap.md`
Phase A). The element type changes, so a clean rename is preferred over permanent dual naming.

### 1. The approved breaking changes (seven as accepted; nine after Amendment 1)

1. **`items → lines`; `OrderItem → OrderLine`.** The line is the commitment's content; its element type changes, so the
   collection is renamed rather than carrying two representations.
2. **`line.product → line.subject: OrderLineSubjectSnapshot`** — a closed union of **five** variants
   (`physical_good | digital_asset | licence | service | plan`). No `bundle` variant (a bundle is expanded into
   component lines by the application). **[Withdrawn by Amendment 3 — see §2B(A).]**
3. **`line.priceBasis?: PriceBasis` (optional) and `line.term?: OrderLineTerm` (optional).** `PriceBasis` carries a
   documented **non-exhaustive consumption rule** (consumers tolerate an absent basis and an unknown `source`), so adding
   a `quote` variant later is additive, not breaking. `priceListId`/`offeringId` are opaque, application-owned references
   that create no package dependency. **[Withdrawn by Amendment 3 — see §2B(B).]**
4. **`Order.create(data, id) → Result<Order, OrderError>`** — the validating creation path (ADR-001). The constructor
   remains the **hydration-only** path (no validation; restores persisted state, including `version`, verbatim).
5. **`order:commitment_immutable`** when priced content is mutated outside `draft`.
   **[Amended by OD-7]** Priced content — the line collection and the order-level adjustments together — is replaced by a
   **single draft-only atomic operation**:
   `setPricedContent(lines: ReadonlyArray<OrderLine>, adjustments: ReadonlyArray<PriceModifier>): Result<void, OrderError>`.
   It validates the complete replacement, re-derives aggregate price coherence under current pricing semantics, and applies
   lines, adjustments and the resulting order-level `PriceRecord` together; on any failure the aggregate is left completely
   unchanged, so an order can never be left partially repriced. The four line mutators of owner decision **C-1**
   (`setLines`, `addLine`, `removeLine`, `updateLineQuantity`) are **not carried forward**: they change lines without the
   price and therefore cannot maintain O-7, and each is expressible as one `setPricedContent` call. C-1's rename intent
   stands for item 1; only its method list is superseded. Consequently `OrderUpdate` no longer accepts priced content —
   `OrderUpdate.price` is **withdrawn**, and `update` keeps only `meta`. The reconciliation and failure contract for this
   operation is specified in §2A (AM-5b/AM-5d).
6. **`version: number` in `OrderState`** — read-only on the aggregate (see §4).
7. **The error-reason additions (§2) and the `attachPayment` fact rule (§3).** `attachPayment` **and** `update` now
   return `Result<void, OrderError>` (both can reject). The buyer snapshot proposal gains additive optional `kind?`,
   `legalName?`, `taxId?`; **withdrawn by Amendment 3 §2B(C)** — the released generic `OrderCustomerSnapshot` has
   none of these fields.
8. **[Amendment 1 — OD-6] `currency: PriceCurrency`, and `PriceRecord` as the persisted price.** `OrderData.currency`
   uses **`PriceCurrency`** (`{ code, exponent }`), not `Currency`. `Currency` describes a *currently supported* currency
   under the present ISO table and cannot represent a committed amount in a withdrawn code or in an exponent the table no
   longer reports (ADR-014 §2, §13). An **empty draft still carries an explicit currency**, because the order's currency
   cannot be derived from price records when there are no lines. O-6 compatibility is decided on `(code, exponent)`.
   `OrderLine.price` and the order-level `price` are **`PriceRecord`**, not `Price`: a `Price` is a transient calculation
   product and does not cross the persistence boundary (ADR-014 §6, §14). Restoration is structural only and MUST NOT
   validate the currency against the current table, recompute an amount, or repair a stored total. The `create`
   acceptance contract is specified in §2A (AM-5a).
9. **[Amendment 1 — OD-9] Pricing semantics identifiers.** Every `PriceRecord` carries the `semanticsId` that produced it.
   Identifiers are assigned exclusively by `@comity/pricing`, are monotonically increasing, immutable, never reused, and
   independent of npm package versions; an identifier covers the whole frozen pipeline (validation, in-order application,
   rounding). Historical verification uses the record's **own** identifier and never falls back to current semantics;
   unknown, retired and unspecified identifiers produce an explicit `unverifiable` outcome (ADR-014 §14.1–14.3).

### 2. Canonical error inventory — accepted five; effective four after Amendment 3

| Reason (`order:`-prefixed) | Invariant | Raised by |
|---|---|---|
| `currency_mismatch` | O-6 | `create`, `setPricedContent`, `submit` |
| `price_incoherent` | O-7 | `create`, `setPricedContent`, `submit` |
| `commitment_immutable` | O-8 | `setPricedContent` outside `draft` |
| `payment_fact_conflict` | O-9 | `create` (supplied `payments`), `attachPayment` |
| `invalid_buyer` | O-11 | ~~`create`, `submit`~~ — **withdrawn by Amendment 3 §2B(C)** |

**[Amendment 3 — §2B(D)]** The `invalid_buyer` row is withdrawn. The effective Phase A additions are therefore the
four reasons `currency_mismatch`, `price_incoherent`, `commitment_immutable` and `payment_fact_conflict`; no other
reason or mapping changes.

**[Amendment 1 — OD-7]** The `Raised by` column was corrected: it previously named `setLines`, `addLine`, `removeLine`,
`updateLineQuantity` and `update`, none of which survive the single `setPricedContent` operation, and it listed
`price_incoherent` for paths that never checked the subtotal. `price_incoherent` is now raised in exactly two situations:
**(a)** a supplied line or order record is internally incoherent — its `total` is not what its own `semanticsId` produces —
at `create`/`setPricedContent`; and **(b)** at `submit`, when a stored record cannot be reconciled under **current**
semantics. O-7 is otherwise maintained **by construction**, because the aggregate derives the order record rather than
accepting one. The effective inventory is **four added reasons and ten reasons in total**: the six original
reasons plus the four additions above. `invalid_buyer` is withdrawn; no existing reason was renamed, and
`invalid_item` is **not** reused (though it becomes unreachable — see the observation in 08 §4.1).

Existing reasons keep their meaning (`invalid_quantity`, `invalid_item`, `invalid_status_transition`,
`shipping_destination_immutable`, `ambiguous_shipping_destination`, `duplicate_item_id` — the last retained for a
duplicate `lineId`). `stale_version`, `bundle_allocation_incoherent` and `invalid_line_term` do **not** exist. The
over-reversal reason `reversal_exceeds_captured` is **not** in this inventory; it ships later, additively, with the
deferred `recordReversal` (§5). **[Amendment 4 — §2C, accepted 2026-11-17]** Six additive reversal reasons
(`reversal_exceeds_captured`, `reversal_conflict`, `invalid_reversal_amount`, `invalid_reversal_id`,
`invalid_reversal_timestamp`, `invalid_reversal_kind`) now extend the inventory with `recordReversal`; this paragraph
records the Phase A state.

### 2A. Amendment 2 — `PriceRecord` reconciliation (AM-5a…AM-5d, 2026-11-06)

**Provenance note.** These decisions formalize ADR-014 §14.7 (A14-12…A14-17) for the Order aggregate. They add no field,
no `OrderError` reason and no package dependency. Order performs only a **plain field comparison** of the persisted public
fields per ADR-014 A14-12; it MUST NOT reimplement Pricing arithmetic or modifier semantics.

**AM-5a — `Order.create()`.** `OrderData.price` and `OrderData.currency` remain **required**; this amendment adds no field
and makes neither optional.

- **Empty Order** (`lines = []`): accept **only** a zero-valued record — `subtotal = 0n`, `total = 0n`, no modifiers,
  supported `format`, current `semanticsId`, and `currency` structurally equal (`code` and `exponent`) to
  `OrderData.currency`. Order checks the zero conditions directly and validates `format`, `semanticsId`, currency
  representation and internal coherence by applying `PriceRecord.combine([suppliedPrice], [])` to the zero record as a
  **single part**, then requiring exact commitment equality (ADR-014 A14-12). `combine()` MUST NOT be called with empty
  `parts` (ADR-014 A14-16).
- **Non-empty Order**: validate the supplied record against
  `PriceRecord.combine(lines.map((line) => line.price), suppliedPrice.modifiers)` and require **exact commitment equality**
  (ADR-014 A14-12). An incoherent or non-matching record is rejected with `price_incoherent`; a currency disagreement is
  `currency_mismatch`.
- Lines **without** a price record are **not representable** under the required data model; there is no unpriced-line
  variant, and none is introduced.

**AM-5b — `Order.setPricedContent(lines, adjustments)`.** The aggregate derives the new order-level `PriceRecord` with
`PriceRecord.combine(lines.map((line) => line.price), adjustments)` and replaces the previous priced content
**atomically** (OD-7):

- old aggregate modifiers are **not** preserved implicitly;
- line-level modifiers are **not** reapplied (ADR-014 A14-13);
- O-6 (one currency, compared on `(code, exponent)`) and O-7 (`subtotal = Σ line totals`) are preserved;
- on any failure the aggregate is left completely unchanged — no partial repricing;
- outside `draft` the operation fails with `commitment_immutable`;
- `lines` MUST be non-empty: `setPricedContent([], …)` is rejected because `combine` cannot derive a currency without a
  part (ADR-014 A14-16). An Empty Order is created with a zero record (AM-5a) and populated through this operation;
  clearing all priced content is not a supported transition.

**AM-5c — `Order.submit()`.** Before transitioning out of `draft`, the aggregate re-derives the expected order-level
record from the **stored** lines and the **stored** order-level modifiers:
`PriceRecord.combine(storedLines.map((line) => line.price), storedPrice.modifiers)`.

- Require **exact commitment equality** (ADR-014 A14-12) between the derived record and the stored aggregate record.
- Any mismatch, or any Pricing failure from `combine`, is rejected as `price_incoherent` (a currency disagreement as
  `currency_mismatch`); the order remains in `draft`.
- This is the **current-semantics eligibility boundary** required by ADR-032 §1 item 5.
- `submit()` MUST NOT call `verify()`, MUST NOT access the retained-semantics table, and MUST NOT call an aggregate-side
  `PriceRecord.from()` (OD-8, ADR-008). A stored record with an older or unknown `semanticsId` fails because `combine`
  rejects non-current parts (ADR-014 A14-15).
- For an **empty draft** (`lines = []`), the zero-record validation of AM-5a applies — a single-part `combine`, never
  empty `parts`.

**AM-5d — Order-level error mapping.** Only the existing approved Order reasons are used:

| Failure | Order error |
| --- | --- |
| Currency `code` mismatch | `order:currency_mismatch` |
| Currency `exponent` mismatch | `order:currency_mismatch` |
| Every other Pricing failure on a priced Order path (unsupported `format`, invalid modifier, unknown/non-current semantics, incoherent part, composition/`subtotal`/`total` mismatch) | `order:price_incoherent` |

Structural restoration failures (malformed persisted data) are **load/deserialization failures**, not `price_incoherent`.
No new `OrderError` reason is introduced. Unchanged retry is **not** expected to succeed: the caller must correct the
input, reprice under current semantics, or migrate the historical data.

**Lifecycle clarity.** The three operations remain distinct:

- **`create`** validates the supplied initial state (AM-5a);
- **`setPricedContent`** derives and atomically replaces the priced state (AM-5b);
- **`submit`** re-derives and verifies commitment eligibility before leaving `draft` (AM-5c).

Existing immutability after commitment is unchanged: priced content cannot be mutated outside `draft`, and `submit` never
mutates the stored record it compares against.

### 2B. Amendment 3 — generic Order/Commerce boundary (2026-11-06)

**Provenance note.** Records architecture-owner acceptance (2026-11-06) of
`commerce/docs/architecture/resolution/order-commerce-boundary-decision.md` (accepted 2026-11-06, per its
acceptance record). The historical text of §1–§3 is preserved above; where it conflicts with this section it is
withdrawn and no longer normative. The provisions below replace it, as authorized for the Order Integration Closure
task.

**A. Subject contract — withdraws §1 item 2.** The five-variant `OrderLineSubjectSnapshot` union
(`physical_good | digital_asset | licence | service | plan`) is withdrawn. The replacement is the generic, owned
snapshot:

```ts
interface OrderLineSubject {
  readonly reference?: string; // opaque, caller-owned trace; never resolved
  readonly name: string; // required display label
  readonly description?: string;
}
```

`OrderLine.subject: OrderLineSubject`. No discriminator, taxonomy, SKU, variant, option or attribute is part of
generic Order; Commerce owns the commercial classification (boundary decision §4.2, §5).

**B. Pricing metadata — withdraws §1 item 3.** Generic `line.priceBasis?: PriceBasis` and
`line.term?: OrderLineTerm` are withdrawn. Price provenance (price lists, agreements, quotes) and
service/licence/plan terms are commercial concerns owned by Commerce (boundary decision §4.4–§4.5). No replacement
field is added to Order.

**C. Buyer/fiscal invariant — withdraws §3 O-11 and `invalid_buyer`.** Generic `@comity/order` no longer enforces
O-11 and no longer raises `order:invalid_buyer`. The generic `OrderCustomerSnapshot` is:

```ts
interface OrderCustomerSnapshot {
  readonly customerId?: string;
  readonly displayName: string;
  readonly contacts?: ReadonlyArray<OrderContact>;
  readonly capturedAt: Instant;
}
```

`kind`, `legalName` and `taxId` are removed. Buyer commercial, billing, legal and fiscal coherence is Commerce
policy and must be enforced at the Commerce boundary (boundary decision §4.3, §4.6–§4.7).

**D. Error inventory reconciliation.** §2's original five-reason count is reconciled: with `invalid_buyer`
withdrawn, the Phase A additions are the four reasons `currency_mismatch`, `price_incoherent`,
`commitment_immutable` and `payment_fact_conflict`. The remaining reasons and their mappings (including AM-5d) are
unchanged; `invalid_item` and `duplicate_item_id` remain in the union as accepted in §2.

**Unchanged by this amendment.** AM-5a…AM-5d; `PriceRecord`/`PriceCurrency`/`setPricedContent`; O-1…O-10; the
payment-fact progression; the advisory `version`; ADR-008/OD-8; ADR-014. This amendment records no new acceptance of
the ADR; it incorporates the separately accepted boundary decision.

### 2C. Amendment 4 — Order refund reversal facts (ACCEPTED 2026-11-17)

**Status of this section: Accepted on 2026-11-17** (acceptance record in section I). It supersedes the §5 exclusion of
`Order.recordReversal` and the reversals collection and extends §2's reason inventory by six reversal reasons. The scope is
deliberately narrow: recording **confirmed refunds** in the `Order` aggregate. It is not a general mechanism for financial
adjustments.

**Labels.** **[ACC]** decided in an Accepted ADR or an owner-approved Commerce decision (source named). **[OWNER
2026-11-17]** an architecture-owner decision of 2026-11-17 (D4-1 … D4-8, P-1 … P-5, CD-A … CD-E), recorded here on the
owner's explicit instruction; the decision is normative through this amendment's acceptance, which is a separate act
(section I). **[PROP]** wording first proposed in the draft; it is normative since the acceptance of this amendment.
**[FACT]** verified evidence, not a decision. **[IMPL]** implementation guidance; not contract.

**Sequencing (D4-7) [OWNER 2026-11-17].** The existing accepted wording was respected and not reinterpreted: ADR-031
(Relationship to existing ADRs), ADR-037 (Relationship, ADR-013/ADR-032 item) and
`commerce/docs/architecture/03-bounded-contexts.md` §3.2c state that Amendment 4 stays deferred until `recordReversal` is
implemented. Amendment 4 therefore stayed Proposed until `Order.recordReversal` was implemented, and was accepted after
the implementation (section I). No note is added to ADR-031, ADR-037 or any Commerce document, and their status,
attribution and acceptance history are unchanged.

#### A. Scope and responsibilities

- **[ACC]** A reversal is a separate, append-only fact in its own collection on the Order. It is **not** a mutation of a
  payment snapshot and **not** a payment status (ADR-031 §4: "`refunded` is never a payment status"; Commerce 03 §3.2c,
  08 §4.2 rule 6).
- **[ACC]** `Order` records the fact only. It performs no provider I/O, does not execute, initiate or confirm refunds,
  and does not import `@comity/payment` (ADR-031 and ADR-037, "Relationship" sections, for ADR-013/ADR-032; Commerce 03
  §3.2c "Commerce records reversals; it never executes them"). This matches `Order.attachPayment`, which "performs no
  payment logic, knows no payment module" (JSDoc, `community/packages/order/src/entities/order.ts`).
- **[ACC]** Recording a reversal changes neither the Order **status** nor the Order **total**; the outstanding balance is
  derived, never stored (ADR-037 F-4; Commerce 03 §3.2c).
- **[ACC]** Provider confirmation, the refund-operation lifecycle, identity binding, orchestration and recovery stay
  outside the aggregate (ADR-031 §4–§6; Payment Attempt Store design §10.4). Only a `succeeded` refund with a valid,
  provider-confirmed amount is translated into a reversal; a pending refund, a failed refund and a `succeeded` refund
  with an unrepresentable amount never are (ADR-031 §4, §7).
- **[PROP]** The operation is `Order.recordReversal(reversal): Result<void, OrderError>`, mirroring `attachPayment`
  (signature recorded as "Deferred" in Commerce 08 §4.2).
- **[OWNER 2026-11-17, D4-8]** `recordReversal` is permitted in **every** Order status. Its validity is determined by the
  captured payment facts and invariant R-1, never by the commercial status of the Order; no status-specific restriction
  is introduced. (This is consistent with `attachPayment`, legal in any status: ADR-037; Commerce CC-2.)

#### B. Reversal identity

- **[ACC]** A reversal carries a **required, caller-supplied** `reversalId`; for a refund it **equals the
  `RefundAttemptId`** (ADR-031 §2 and §7; ADR-037 follow-up CC-3; Commerce 03 §3.2c, 08 §4.2). In the Payment Attempt
  Store the `RefundAttemptId` is the refund operation record's `operation_record_id` (design §5, §9.2).
- **[ACC]** The identity is not derived from provider data: neither the provider `refundId` (can be absent on a pending
  response) nor a notification `eventId` (identifies a delivery, not a refund) is used (ADR-031 §6, Alternatives).
- **[OWNER 2026-11-17, D4-1]** The deduplication identity of v1 is `reversalId`, and v1 reversals are refund reversals
  only.

#### C. Reversal fact shape (v1)

**[OWNER 2026-11-17, D4-1]** Version 1 supports **exclusively `kind: "refund"`**. `credit` and `adjustment`, which appear
in the Commerce planned shape (08 §4.2, 03 §3.2c) but are defined by no ADR, are **deferred to a future extension with
separately defined semantics and identity rules**. `reference` is **not part of the v1 contract**, because its semantics
are not sufficiently defined (for payment facts it carries the `PaymentAttemptId`, ADR-037 CC-1; for a refund reversal
that role is already taken by `reversalId`). The v1 fact is therefore:

| Field | Required | Source and purpose | Notes |
|---|---|---|---|
| `reversalId: string` | required | Caller-supplied identity; `RefundAttemptId` ([ACC] ADR-031 §7, CC-3) | Validation of the string form (non-empty, opaque) is not specified by any source; see the remaining ambiguities |
| `kind: "refund"` | required | Discriminator reserved for the deferred kinds | [OWNER D4-1] The only v1 value |
| `amount: Money` | required, strictly positive | The provider-confirmed refund amount (ADR-031 §4, §7) | [OWNER D4-3] An amount less than or equal to zero is rejected. `Money` is non-negative and zero is representable (ADR-031 verified facts) |
| `paymentId: string` | required | The payment fact being reversed | [ACC] required (Commerce 03 §3.2c, 08 §4.2 rule 5) |
| `recordedAt: Instant` | required | When the fact was recorded | [OWNER D4-3] **Caller-supplied**; see D |

No other field exists in v1. Descriptive metadata (for example `reason`, or a future `reference`), if introduced by a
later version, must not silently become part of v1 equality (D4-3).

**Deferral of the `attachPayment` currency guard (D4-6) [OWNER 2026-11-17].** ADR-037 (Relationship; Unresolved question
4) refers to an optional Order-level currency guard on `attachPayment` as "deferred to ADR-032 Amendment 4". **This
amendment does not include it.** The guard is excluded and deferred to a separate owner decision; `attachPayment` and the
payment-fact progression (§3) are unchanged by Amendment 4. ADR-037 is not modified.

#### D. Idempotency, conflicts and time

Following the `attachPayment` / `evaluatePaymentFact` convention (`community/packages/order/src/entities/order.ts`): the
outcomes are *append*, *no-op* or *conflict*; a no-op succeeds and touches nothing; a conflict returns a `failure` with an
`OrderError` and leaves the aggregate unchanged.

- **[ACC]** An identical repeat of a recorded `reversalId` is an idempotent no-op; the same `reversalId` with different
  content is a conflict reported with an additive Order reason; otherwise the fact is appended only if R-1 holds
  (ADR-031 §7).
- **[OWNER 2026-11-17, D4-3]** The deduplication identity is `reversalId`. **Content equality consists of `kind`,
  `paymentId` and `amount`.** `recordedAt` is **excluded**. A retry with the same `reversalId`, `kind`, `paymentId` and
  `amount` is a **no-op even when the supplied `recordedAt` differs**; on a no-op nothing is touched, including the
  stored `recordedAt`.
- **[OWNER 2026-11-17, D4-3, P-3, P-4, CD-C, CD-D]** Evaluation order of `recordReversal`, so that a retry of an
  already-recorded reversal is a no-op even if R-1 would now reject the same amount:
  1. an empty or whitespace-only `reversalId` (`trim().length === 0`) → `order:invalid_reversal_id`, before identity;
  2. identity: an identical existing reversal is a **no-op**; the same `reversalId` with different content →
     `order:reversal_conflict`;
  3. for a genuinely new reversal only: a `kind` other than `"refund"` at runtime → `order:invalid_reversal_kind`;
  4. the amount → `order:invalid_reversal_amount`;
  5. `recordedAt` → `order:invalid_reversal_timestamp` (a no-op neither reads nor validates `recordedAt`);
  6. captured-fact uniqueness for the `paymentId` → `order:reversal_conflict` (CD-B);
  7. R-1 → `order:reversal_exceeds_captured`;
  8. append, with `updatedAt = recordedAt` (P-2).

  No check changes state before step 8: every rejection and every no-op leaves the aggregate, `updatedAt` included,
  unchanged. Hydrated historical reversals are never revalidated.
- **[OWNER 2026-11-17, D4-3]** `recordedAt: Instant` is **supplied by the caller**. The aggregate **must not generate
  timestamps from a system clock** in `recordReversal`. This is consistent with Commerce decision **D-026** (new
  aggregate data receives instants from the caller; `commerce/docs/architecture/11-decision-register.md`, D-026) and with
  the rule that domain entities do not store `Date.now()` results. It differs from `attachPayment`, which reads
  `Instant.now()` for `updatedAt`; the existing behaviour of `attachPayment` is not changed here.
- **Recovery consequence.** Because variable data is excluded from equality, the retry in Payment Attempt Store design
  §10.4 step 2 is a no-op however late it runs (section G).

**Error reasons (D4-4) [OWNER 2026-11-17].** Two additive Order reasons are confirmed, `order:`-prefixed like the existing
ones (`community/packages/order/src/errors/order.ts`, `OrderErrorReason`; additive per `errors.md` §10):

| Reason | Raised when | Convention to follow |
|---|---|---|
| `order:reversal_exceeds_captured` | R-1 would be violated, including when no `captured` fact exists for the `(paymentId, currency)` (captured amount zero) | Already named in §2 and Commerce 03 §3.2c as the future over-reversal reason |
| `order:reversal_conflict` | The `reversalId` is already recorded with different `kind`, `paymentId` or `amount` | Named as "for example `reversal_conflict`" in ADR-031 §7; this draft confirms the name |

**[PROP]** Messages, HTTP statuses and `details` follow the existing conventions: a message per reason in
`REASON_MESSAGES`, **409** for both conflict-class reasons (as `payment_fact_conflict`, `currency_mismatch`,
`price_incoherent`), and the existing `details` keys (`orderId`, `field`, …). No additional error metadata is invented;
in particular no `reversalId` key is added to `details` by this draft. The HTTP statuses were subsequently approved by the
owner (section H, "HTTP mapping", **[OWNER 2026-11-17]**).

**Complete set of reversal-related reasons.** The two reasons above were extended by owner decisions of 2026-11-17 (section
H). There are **six reversal-related reasons in total**: `order:reversal_exceeds_captured` and `order:reversal_conflict`
(D4-4), and four newly introduced input-validation reasons, `order:invalid_reversal_amount` (P-1),
`order:invalid_reversal_id` (P-3), `order:invalid_reversal_timestamp` (P-4) and `order:invalid_reversal_kind` (CD-C).
`order:reversal_conflict` is also used for a duplicate `reversalId` in `Order.create` and for ambiguous captured history
(CD-A, CD-B).

**Non-positive amount.** The owner directed reuse of an existing generic Order reason if the existing conventions provide
an appropriate one, and no third reversal-specific reason without a demonstrated need. The existing reasons are
`invalid_quantity` (line quantity), `invalid_item`, `invalid_status_transition`, `shipping_destination_immutable`,
`ambiguous_shipping_destination`, `duplicate_item_id`, `currency_mismatch`, `price_incoherent`, `commitment_immutable` and
`payment_fact_conflict`. None of them describes an invalid reversal amount, and the only candidate, `invalid_quantity`,
is documented and messaged as an order-line quantity. This draft therefore **does not select a reason** and **adds no
third reason as a decision** in D4-4 itself. The owner subsequently approved the additive reason
`order:invalid_reversal_amount` (section H, P-1, **[OWNER 2026-11-17]**); D4-4's two reasons and their semantics are
unchanged.

#### E. Cumulative reversal invariant R-1

**[ACC]** text: "per `paymentId` and currency, `Σ reversals ≤ Σ captured`" (ADR-031 §7; Commerce 08 §4.2 and 03 §3.2c).
**[OWNER 2026-11-17, D4-2]** Its v1 meaning is:

- The invariant is scoped by **`(paymentId, currency)`**. Sum all recorded reversals for the same payment and currency
  (including the reversal being recorded) and compare that sum against the captured amounts for the same payment and
  currency; the sum must not exceed the captured amount.
- Under the accepted payment-fact progression (§3, owner decision D-1: dedupe on `(paymentId, status)`, `captured`
  terminal, a same-key different-amount fact is `payment_fact_conflict`; partial captures unsupported in v1, ADR-037) a
  `paymentId` has **at most one `captured` fact**. The captured sum is therefore that single fact's amount.
- **If no `captured` fact exists** for the `paymentId` (none recorded, or only `authorized`, `failed` or `cancelled`),
  the captured amount is **zero** and any positive reversal violates R-1 (`order:reversal_exceeds_captured`).
- **No implicit currency conversion.** Amounts are compared only when comparable. Comparison uses the `Money`
  representation available at runtime, **including its current exponent**; a reversal whose currency is not the
  currency of the captured fact is not summed against it (its captured amount for that currency is zero).
- **Accepted limitation (PAYMENT-PERSISTENCE-01) [OWNER D4-2, D4-5].** `Money` does not guarantee preservation of the
  historical currency exponent (Commerce 08 §4.2). For v1 this limitation is **explicitly accepted**: R-1 is evaluated on
  the runtime `Money` representation, not on a historical exponent.
- The existing payment-fact progression is not changed and partial captures are not introduced.

**Recovery requirement for the application (not an Order rule) [OWNER D4-2].** If a refund is provider-confirmed before
its captured payment fact is durably persisted, the application leaves the refund operation **open and recoverable**. It
does not treat the missing capture as a permanent refund refusal. This preserves the §10.4 ordering of the Payment
Attempt Store design: the Order records the capture fact first, and the open operation remains a reconciliation
candidate until the reversal can be recorded. The Order itself reports `order:reversal_exceeds_captured`; classifying
that outcome as recoverable or permanent is the application's responsibility and is not changed by the design document
here.

#### F. Persistence and concurrency consequences

**Contract consequences** (follow from the owner decisions and accepted ADR-029/ADR-001; effective on acceptance):

- **[OWNER 2026-11-17, D4-5]** The reversals collection is **normalized**: an **absent** reversals collection and an
  **empty** one have the **same semantic meaning**. The distinction that `payments` preserves between absent and empty
  is not replicated for reversals. Existing persisted Orders **hydrate with an empty reversals collection** after the
  additive migration.
- **[ACC]** Hydration restores persisted state **verbatim** (ADR-001), as for `payments`; accessors return copies, as
  `Order.payments` does.
- **[ACC]** The repository persists the root and its reversals **atomically** under the versioned save of ADR-029: one
  compare-and-set on the root version, all child writes committed or none, a stale save mutates nothing, and no internal
  retry of a conflict (ADR-029 §4.3, Guarantees 2, 5 and 6). A reversal recorded on a stale snapshot therefore fails with
  `repository:conflict` and never overwrites a newer reversal.
- **[ACC]** A versioned adapter that persists reversals as related records declares multi-record atomicity, so TC-6 is
  mandatory for it (ADR-029 §6; `repository-conformance.md`), and its full-state capture used by TC-6 must include the
  reversal records.
- **[OWNER 2026-11-17, D4-5]** The historical `Money` exponent limitation is accepted for v1 (see E).

**Implementation guidance** (**[IMPL]**, not contract):

- `@comity/order`: the optional reversals collection on the Order data and state, `recordReversal` beside
  `attachPayment`, the six reasons in `OrderErrorReason`, and copy-on-save reversals in the memory repository — **done**
  in the Community working tree (section I).
- Commerce `@comity/order-sql` (`commerce/adapters/order-sql`), which today persists payment facts in
  `comity_order_payments` next to `comity_order_orders`: an additive child table for reversals in both the PostgreSQL
  and the SQLite/D1 migrations, written inside the existing atomic save (PostgreSQL transaction; SQLite/D1 single
  `atomicBatch`), with no flag analogous to `has_payments`, and the reversal records added to the TC-6 scenario and the
  full-state fixtures.
- An additive migration and a minor 0.x release of `@comity/order`, with a migration note for adapters.

#### G. Relationship to the Payment Attempt Store recovery order (design §10.4, OT-5d)

As documented in the design (read-only reference, `payment-attempt-store-design-proposal.md` §6.3 OT-5d and §10.4; **this
amendment does not change the design document and does not claim that G-3 is satisfied**):

1. A refund operation reaches `succeeded` with a valid amount and a bound `refundId` (provider result, `retrieveRefund`,
   verified notification or manual entry).
2. The application loads the Order, calls `recordReversal({ reversalId: <RefundAttemptId>, kind: "refund", … })` and
   saves it with the versioned save. The outcome is *append* or *no-op*.
3. Only after step 2 is confirmed durable, the refund operation transition is persisted with its own compare-and-set.

**Why a crash between 2 and 3 is recoverable.** Until step 3 commits, the refund operation stays open, so it remains a
reconciliation candidate (design §10.4 "Recovery marker"). A retry re-obtains the provider evidence; step 2 is an Order
**no-op** because the same `reversalId` with the same `kind`, `paymentId` and `amount` is already recorded, regardless of
the `recordedAt` the retry supplies (D, D4-3); and step 3 then applies once. Duplicate notifications and duplicate
requests therefore yield one reversal (ADR-031 §6). This holds only if the Order save is version-checked (ADR-029), the
provider-confirmed amount is re-obtained identically (a different re-obtained amount is a genuine anomaly, design OI-2),
and the application treats a missing capture as recoverable (E).

#### D4. Owner decisions of 2026-11-17 and what remains open

| # | Decision | Status |
|---|---|---|
| D4-1 | v1 supports only `kind: "refund"`; `credit` and `adjustment` deferred; no `reference` in v1; `reversalId` = `RefundAttemptId` | **Owner-approved 2026-11-17** (C, B) |
| D4-2 | R-1 scoped by `(paymentId, currency)`; single captured fact; no capture ⇒ zero; no implicit conversion; runtime `Money` incl. exponent; PAYMENT-PERSISTENCE-01 limitation accepted; missing-capture recovery requirement | **Owner-approved 2026-11-17** (E) |
| D4-3 | Dedupe on `reversalId`; equality on `kind`, `paymentId`, `amount`; `recordedAt` excluded and caller-supplied; no system clock; amounts ≤ 0 rejected | **Owner-approved 2026-11-17** (C, D) |
| D4-4 | Reasons `order:reversal_exceeds_captured` and `order:reversal_conflict`; no third reversal-specific reason without demonstrated need | **Owner-approved 2026-11-17** (D); reason for non-positive amounts not yet selected (below) |
| D4-5 | Normalized collection; absent = empty; existing Orders hydrate empty; exponent limitation accepted | **Owner-approved 2026-11-17** (F) |
| D4-6 | `attachPayment` currency guard excluded and deferred to a separate owner decision | **Owner-approved 2026-11-17** (C) |
| D4-7 | Existing sequencing respected: Amendment 4 stays Proposed; `recordReversal` is implemented before acceptance; no notes added elsewhere | **Owner-approved 2026-11-17** (head of §2C) |
| D4-8 | `recordReversal` permitted in every Order status | **Owner-approved 2026-11-17** (A) |

These approvals fixed the direction of the draft; they were not themselves an acceptance of Amendment 4 (section I records
the acceptance). Section H records the subsequent owner decisions of 2026-11-17 (P-1 … P-5, the HTTP mapping and
CD-A … CD-E); it does not change D4-1 … D4-8.

**No open points remain on P-1 … P-5 or CD-A … CD-E.** P-3 and P-4, previously open on the validation responsibility and its location,
were resolved by owner decisions of 2026-11-17 (section H). This does not change D4-1 … D4-8.

#### H. Remaining contract questions — analysis and owner decisions (2026-11-17)

**Status of this section.** On 2026-11-17 the architecture owner approved P-1 … P-5 and the HTTP mapping; the two
points initially left open (P-3: who rejects an empty `reversalId`; P-4: where `recordedAt` validity is enforced) were
resolved by explicit owner confirmation the same day, and the corrective decisions CD-A … CD-E followed (below). Approved
items are marked **[OWNER 2026-11-17]**. **[FACT]** marks an existing Comity contract or implementation fact verified
read-only on 2026-11-17 in `community` and `commerce` (source paths are relative to those repositories); it is evidence,
not a decision. These decisions do not change D4-1 … D4-8. They became normative through the acceptance of this
amendment (section I).

##### P-1. Reason for a zero reversal amount

- **[FACT]** `OrderErrorReason` has ten members (`community/packages/order/src/errors/order.ts`). `invalid_quantity` is
  messaged "Invalid order line quantity" and is raised only for line quantity, with `itemId` and `field: "quantity"`
  (`community/packages/order/src/entities/order.ts`, `findLineStructureViolation`). No existing reason describes an
  invalid reversal amount.
- **[FACT]** `Money.create` rejects negative amounts only (`community/packages/pricing/src/value-objects/money.ts`), so a
  negative `Money` cannot currently be constructed; a zero `Money` can. For a `Money` amount, D4-3's rule "less than or
  equal to zero is rejected" therefore reduces to rejecting zero.
- **[FACT]** `attachPayment` performs no amount-positivity check.
- **[OWNER 2026-11-17, P-1]** The additive, reversal-specific reason **`order:invalid_reversal_amount`** is approved. It is
  raised when the reversal `amount` is zero, with `details.field: "amount"`. `order:invalid_quantity` is not reused,
  because it is scoped to order-line quantity, and no unrelated validation reason is introduced. The two reasons approved
  under D4-4 are unchanged. This is the demonstrated need that D4-4 required for a third reversal-specific reason. Its HTTP
  status is recorded separately below.

##### P-2. `updatedAt`

- **[FACT]** Every existing `Order` mutator sets `updatedAt = Instant.now()`, including `attachPayment` on an append; an
  `attachPayment` no-op touches nothing (`community/packages/order/src/entities/order.ts`). `updatedAt` therefore means
  "last time the aggregate changed", and is independent of the fact timestamps `authorizedAt` and `capturedAt`
  (`community/packages/order/src/contracts/payment-snapshot.ts`).
- **[FACT]** D-026 (`commerce/docs/architecture/11-decision-register.md`) states that new aggregates receive instants from
  the caller, and Commerce 13 and 01 (G-15) record `Order`'s internal `Instant.now()` as the legacy pattern. D-026 names
  new aggregates; `Order` pre-dates it, so it applies to `recordReversal` by analogy and not by letter.
- **[FACT]** Precedent for one caller-supplied instant serving as both the domain fact and aggregate metadata:
  `Fulfillment.complete(outcome, at)` records `at` as `completedAt` and `updatedAt`, `Fulfillment.create` and
  `Entitlement.create` set `createdAt = updatedAt = at`, and a repeated completion is a true no-op
  (`commerce/packages/fulfillment/src/entities/fulfillment.ts`; `commerce/packages/entitlement/src/entities/entitlement.ts`).
- **[OWNER 2026-11-17, P-2]** On a successful reversal append, `updatedAt = recordedAt`. On an idempotent no-op the
  aggregate is unchanged, including `updatedAt`. `recordReversal` reads no system clock. No separate aggregate timestamp
  field or parameter is added, and no monotonicity rule or clamping is imposed.
- **Consequence stated explicitly.** `updatedAt` may move **backwards** when a late recovery supplies a `recordedAt`
  earlier than the current `updatedAt`. No monotonic rule exists and the supplied timestamp is not clamped.

##### P-3. Identifier validation

- **[FACT]** Order payment-fact identifiers are plain strings (`OrderPaymentSnapshot.paymentId?: string`,
  `community/packages/order/src/contracts/payment-snapshot.ts`). `RefundAttemptId` is an application-level concept and is
  not an exported Community value object; the refund contract carries it as `reference: string`
  (`community/packages/payment/src/contracts/payment-refund.ts`).
- **[FACT]** The application-side `OperationRecordId` (the `RefundAttemptId` of a refund) enforces non-empty input after
  trimming; its 255-character bound is enforced by the store's `invalid_data` validation, not by the value object
  (`commerce/examples/payment-attempts/src/application/identifiers.ts`). `OrderId` follows the same non-empty pattern.
- **[FACT]** The existing Order contract establishes no general identifier format, maximum length or normalization rule,
  and hydration copies payment facts without string validation.
- **[OWNER 2026-11-17, P-3]** `reversalId` and `paymentId` remain plain `string`. No new value object, ID type, format,
  length limit or normalization is introduced by this amendment.
- **[OWNER 2026-11-17, P-3]** **Aggregate-level validation of `reversalId`.** `Order.recordReversal` rejects a
  `reversalId` for which `reversalId.trim().length === 0`:
  1. the validation occurs **before** identity lookup or idempotency evaluation;
  2. the original value is stored **unchanged**; no non-empty identifier is trimmed, normalized or otherwise transformed;
  3. hydrated historical reversals are **not** revalidated;
  4. rejection uses the additive Order reason **`order:invalid_reversal_id`**, with `details.field: "reversalId"` and
     HTTP status **400 Bad Request**.

  *Rationale.* `reversalId` is the idempotency key of a financial reversal. An empty key could make distinct refunds be
  treated as an idempotent no-op, compromising reversal accounting and the captured-amount invariant (R-1).
- **[OWNER 2026-11-17, P-3]** No empty-ID validation rule is introduced for `paymentId`; it is not required by R-1, which
  only matches it against recorded captured facts.

##### P-4. `recordedAt` validity

- **[FACT]** `Instant` (`community/packages/primitives/src/time/instant.ts`) wraps a number and validates nothing:
  `fromEpochMilliseconds` accepts `NaN` and infinite values, and `toISOString()` throws for them. The current `Instant`
  implementation **does not guarantee finiteness**.
- **[FACT]** No existing Order or payment contract orders timestamps relative to capture; the refund flow may legitimately
  record a refund after provider confirmation or after recovery (design §10.4); and Fulfillment documents that
  chronological coherence is the application's responsibility (`commerce/docs/architecture/stage-4a-fulfillment-entitlement-integration.md`).
- **[OWNER 2026-11-17, P-4]** `recordedAt` **must be a finite, serializable instant**. No chronological ordering of
  `recordedAt` relative to the capture or any other event is imposed, and no age, future-time or clock-skew limit is
  introduced. The caller/application remains responsible for temporal coherence.
- **[OWNER 2026-11-17, P-4]** **Aggregate-level validation of `recordedAt`.** `Order.recordReversal` rejects an invalid
  `recordedAt` **on the append path**:
  1. with `const ms = recordedAt.epochMilliseconds`, the value is valid only when
     `Number.isFinite(ms) && Math.abs(ms) <= 8.64e15`;
  2. the validation occurs **only after** the operation is determined not to be an idempotent no-op; a no-op **neither
     reads nor validates** `recordedAt`;
  3. the application boundary has a **documented precondition** to supply a valid `Instant`;
  4. integer milliseconds are **not** required, and no chronological ordering relative to the capture, age limit,
     future-time restriction or clock-skew tolerance is introduced;
  5. rejection uses the additive Order reason **`order:invalid_reversal_timestamp`**, with
     `details.field: "recordedAt"` and HTTP status **400 Bad Request**;
  6. the shared `Instant` contract and implementation, and `@comity/primitives`, are **not** modified by this amendment;
     any future decision to strengthen `Instant` globally is a separate task. This must not be read as saying the current
     `Instant` guarantees finiteness.

  *Rationale.* P-2 assigns `recordedAt` to `updatedAt` after a successful append, so the aggregate must prevent an invalid
  timestamp from corrupting its own state, including when invoked directly outside the application boundary.

##### P-5. Currency exponent and `Money` comparison (D4-2 preserved)

- **[FACT]** `Currency.equals` compares the currency code (`community/packages/pricing/src/value-objects/currency.ts`).
  `Money.equals`, `add` and `subtract` rely on it (`.../money.ts`).
- **[FACT]** A `Money` obtains its exponent from the current ISO currency table. Two currently constructible `Money`
  instances with the same code therefore cannot carry different exponents.
- **[FACT]** A structural `PriceCurrency`, such as the currency recorded by Order, can preserve an explicit exponent and
  is compared by `(code, exponent)` in the existing Order implementation (`currencyEquals`;
  `community/packages/order/src/contracts/order.ts`).
- **[OWNER 2026-11-17, P-5]** The currency semantics approved by D4-2 (code and exponent) are preserved. `Money.equals`
  and `Currency.equals` are **not** modified, and no special comparator is introduced inside `recordReversal`. As a
  matter of implementation fact, `Money.equals` does **not** independently compare exponents: it compares the currency
  code, and a current `Money` derives its exponent from the ISO table, so two instances with the same code cannot
  represent different exponents. The accepted historical-exponent limitation (PAYMENT-PERSISTENCE-01) is preserved and
  not reopened. If an implementation must compare a `Money` currency against a structural `PriceCurrency`, the existing
  structural `(code, exponent)` semantics apply and that boundary is documented precisely; any comparison against the
  Order currency touches the deferred `attachPayment` currency guard and stays within D4-6's deferral.

##### HTTP mapping

- **[FACT]** Order reasons carry their own HTTP status in `REASON_HTTP_STATUS`
  (`community/packages/order/src/errors/order.ts`): conflict-type reasons map to 409 and input-validity reasons to 400. The
  transport layer uses the status supplied by the domain error metadata and defaults to 500
  (`community/packages/http-hono/src/internal/map-error.ts`).
- **[OWNER 2026-11-17]** The mapping is approved:

  | Reason | `details.field` | HTTP |
  |---|---|---:|
  | `order:reversal_exceeds_captured` | `amount` | 409 Conflict |
  | `order:reversal_conflict` | `reversals` | 409 Conflict |
  | `order:invalid_reversal_amount` | `amount` | 400 Bad Request |
  | `order:invalid_reversal_id` | `reversalId` | 400 Bad Request |
  | `order:invalid_reversal_timestamp` | `recordedAt` | 400 Bad Request |
  | `order:invalid_reversal_kind` | `kind` | 400 Bad Request |

  These are the six reversal-related reasons. The mapping is not extended to unrelated errors, introduces no HTTP
  dependency into the domain package, and does not change the semantics of the D4-4 reasons. The statuses are carried by
  the domain error metadata, as for the existing reasons.

##### Corrective decisions CD-A … CD-E (2026-11-17)

Approved by the architecture owner after a read-only contract review of the first implementation.

- **[OWNER 2026-11-17, CD-A]** **Duplicate reversal IDs in `Order.create`.** `Order.create` validates supplied initial
  `reversals` as new state, in the supplied order, with the per-fact rules of `recordReversal`. A `reversalId` that
  appears more than once is rejected, whether the entries are identical or different, with `order:reversal_conflict` and
  `details.field: "reversals"`. Nothing is deduplicated or preserved. Valid unique reversals keep their order. The
  constructor restores historical reversals verbatim and validates nothing.
- **[OWNER 2026-11-17, CD-B]** **At most one captured fact per `paymentId`.** `Order.create` rejects more than one
  `captured` fact for the same `paymentId`, identical or not, with the existing `order:payment_fact_conflict`
  (`details.field: "payments"`); this tightens O-9 for `create` and changes nothing in `attachPayment` or the progression
  of §3. Because hydration preserves history unvalidated, `recordReversal` fails conservatively with
  `order:reversal_conflict` (`details.field: "reversals"`) when the aggregate holds more than one `captured` fact for the
  reversal's `paymentId`; the captured facts are never summed and none is selected. The guard runs only for a genuinely
  new reversal, after the `recordedAt` check and before R-1, and changes no state. The conflict code is deliberately
  reused although the ambiguity originates in payment facts.
- **[OWNER 2026-11-17, CD-C]** **Runtime reversal kind.** For a genuinely new reversal, a `kind` other than `"refund"`
  at runtime is rejected with the additive reason `order:invalid_reversal_kind`, `details.field: "kind"`, HTTP 400.
  Identity is resolved first: an existing `reversalId` keeps its no-op or conflict result. Hydrated reversals are not
  validated.
- **[OWNER 2026-11-17, CD-D]** **Validation order** is the one in section D. Its position of the kind, amount,
  `recordedAt` and uniqueness checks among the append-path checks is normative.
- **[OWNER 2026-11-17, CD-E]** **Contract clarity.** The `Order.create` and `Order.recordReversal` documentation in the
  implementation and package documentation describes the no-op semantics, the validation order, the verbatim hydration
  and the mutation guarantee above.

##### Implementation status

- **[FACT]** `Order.recordReversal`, the reversals collection, `Order.create` validation of initial reversals and the six
  reasons are implemented in `community/packages/order`, with tests, in the Community working tree at HEAD `038ed65`
  (uncommitted and unreleased when this amendment was accepted).
- The persistence adapter (Commerce `order-sql`), refund orchestration, the PSP, the scheduler and every other
  application workflow are **not** implemented by this amendment, and **gate G-3 of the Payment Attempt Store design is
  not satisfied** by it.

#### I. Acceptance record

- **Accepted 2026-11-17**, by the architecture owner's explicit authorization in the closure work package of that date,
  conditional on completion of the changes and checks below. The date is the date of the status transition.
- **Criteria met.** (1) `Order.recordReversal` implemented (D4-7). (2) The owner decisions D4-1 … D4-8, P-1 … P-5, the
  HTTP mapping and CD-A … CD-E are recorded with provenance. (3) An independent review was reported by the architecture
  owner; its findings F-2 (package design document still describing the reversals collection as deferred) and F-3 (no
  direct `Order.create` tests for a zero amount and an invalid timestamp) were resolved on 2026-11-17, and F-4 (the
  captured-history guard using `order:reversal_conflict`) is the approved CD-B behaviour. (4) The implementation was
  re-checked against the decisions on 2026-11-17, and the Community package checks passed: `vitest run --coverage`
  (204 passed, 1 skipped), `tsc --noEmit`, `eslint`, `prettier --check` on the changed files, the package build and
  `git diff --check`.
- **Scope.** The acceptance is of this amendment only. It does not change ADR-029, ADR-031 or ADR-037, which are
  unmodified, and it does not claim that any commit, release or Commerce integration exists.

**Unchanged by this amendment.** ADR-029, ADR-031 and ADR-037; the payment-fact progression (§3) and `attachPayment`
(CD-B only tightens `Order.create`); the §2 inventory and the §5 exclusion except as annotated above; AM-5a…AM-5d;
Amendments 1–3; this ADR's status line (`Accepted`) and the 2026-11-05 acceptance record.

### 3. Invariants and the payment-fact progression

The aggregate enforces O-1…O-9. **[Amendment 3 — §2B(C): O-11 is withdrawn from generic Order.]** (Authoritative
table: `commerce/docs/architecture/03-bounded-contexts.md` §3.2.) In particular:

- **O-11 (buyer coherence, owner decision D-2):** `kind: "organization"` requires `legalName`; `taxId` is valid only for
  organizations (`kind` defaults to `individual`). Enforced in `Order.create`; `order:invalid_buyer`. Buyer validation
  stays on the aggregate; it is not pushed to the application. O-10 (cancellation requires cancellable lines) remains an
  **application** precondition, not an aggregate rule. **[Withdrawn by Amendment 3 — §2B(C); buyer commercial/fiscal
  coherence is Commerce policy.]**
- **Payment facts (owner decision D-1):** dedupe key `(paymentId, status)`; an identical repeat is a no-op (terminal
  facts included); a fact without `paymentId` is always appended and can never be reversed through the Order. Progression
  per `paymentId`: none → any initial status; `authorized → {captured, failed, cancelled}`; `captured`/`failed`/
  `cancelled` are terminal. Any other transition, or a same-key different-amount fact, is `order:payment_fact_conflict`.
  `OrderPaymentSnapshot` stays immutable.

### 4. Version and optimistic concurrency (contract only; no enforcement here)

The aggregate carries `version` read-only and **never** increments it. A newly created, not-yet-persisted aggregate has
`version: 0`; hydration restores the persisted value verbatim. The repository semantics (insert → `1`; compare-and-set
update → `+1` exactly once per successful save; failed check persists nothing; `repository:conflict`) are owned by the
**separate Proposed ADR-029** and by the eventual repository implementation. **Until ADR-029 is accepted and a conforming
adapter exists, `version` is advisory** [_update 2026-11-12: ADR-029 is now Accepted; whether an adapter's evidence satisfies the application's production gate is decided by that gate_] and no production write path that mutates money or rights may ship. This ADR
fixes only the aggregate-side shape of `version`, so it is shaped once; it does not implement ADR-029.

### 5. Explicit exclusions (not in Phase A)

`customer → buyer` rename; `OrderProfile`; `cancel(reason)` and any reason enum (the Order is business-model neutral;
`cancel()` stays argument-free and the application records why); `bundle` subject variant and `BundleGroupRef`;
`stale_version` / `saveWithVersion` / `VersionedRepository`; `origin` / `OrderOrigin` (and `amendment_of`: amendments are
unsupported in v0, reintroduced additively with the first capability that needs them); `Order.recordReversal` and the
reversals collection (deferred, gated on ADR-031/C4 — **[Amendment 4 — §2C, accepted 2026-11-17: no longer excluded]**); any `@comity/offering` / `@comity/commerce-*` package. These
exclusions are part of the decision: they keep the one free breaking change minimal.

### 6. Relationship to ADR-029 / ADR-030 / ADR-031 (not absorbed)

ADR-029 (repository optimistic concurrency), ADR-030 (payment initiation idempotency) and ADR-031 (payment refund
contract) remain **separate, Proposed** Comity prerequisites. They gate *production* capabilities —
persisted money/rights writes (ADR-029), live `PaymentProvider.initiate` (ADR-030), refund execution and
`recordReversal` (ADR-031) — but they are **not** prerequisites for starting the limited Phase A Order extension, which
ships the contract (including the advisory `version` shape) without enabling those production paths. This ADR neither
accepts nor implements them.

## Alternatives considered

| Alternative | Rejected because |
|---|---|
| Parallel `CommerceOrder` / universal cart | Duplicates the aggregate; the frozen architecture (AD-06, principle 3) forbids it; ADR-013 already makes `Order` the cart-as-`draft` aggregate |
| Additive-only (no break) | Leaves two representations of every line permanently and lets consumers read the wrong one |
| Validate inside the constructor | Breaks hydration (ADR-001), which must restore persisted state verbatim |
| Keep `items`/`OrderItem` names, add `lines` alongside | Permanent dual naming for a type that changes shape anyway |
| Fold ADR-029/030/031 into this ADR | Conflates an aggregate-shape change with primitives/payment contract changes that have their own blast radius and their own production gates |
| Ship the full Commerce proposal change set (rename, `profile`, `cancel(reason)`, bundle, `origin`) | Breaks more than any finding requires; excluded by §5 |

## Consequences

**Positive:** the commitment's two essential invariants hold from the first write; one minimal, well-scoped break while
it is still free (no code consumer); `version` is shaped once; no new package or concept beyond the frozen scope.

**Negative:** a breaking (minor, 0.x) release of a published package, with a migration note; `update`/`attachPayment`
signatures change from `void` to `Result<void, OrderError>`; `version` ships inert until ADR-029 lands.

**Amendment 1 (OD-6/OD-7/OD-9) — additional consequences:**

- *Positive:* a committed order keeps its exact monetary facts across a currency withdrawal, an exponent change, or a
  later change of pricing arithmetic; priced content is replaced atomically, so a failed replacement cannot leave an order
  partially repriced; verification of a historical record becomes honest (`unverifiable` is a first-class outcome instead
  of a silent recomputation).
- *Negative:* `OrderData.currency` becomes `PriceCurrency` and `OrderLine.price`/order-level `price` become `PriceRecord`,
  which is a further breaking change on top of the Phase A break; adapters gain an obligation to persist the exponent, the
  semantics identifier and `bigint` amounts losslessly, and to never recompute a stored amount on read.
- *Negative:* `@comity/order` uses a runtime value import from `@comity/pricing`. This is **owner-approved (OD-8)**,
  narrowly scoped to the public `PriceRecord` record types (`PriceRecord`, `PriceCurrency`, `PriceModifierRecord`) and
  `combine`, and **formally incorporated (2026-11-06)** into the ADR-008 register as a **Value** dependency
  (`importKind: "value"`, category `"value-import"`). Implementation was separately authorized (ADR-008
  "Amendment 1") and is now released; the approved scope includes no `verify()`, no retained-semantics table access and
  no aggregate-side `PriceRecord.from()`.
- *Negative:* retaining frozen historical semantics is a permanent maintenance obligation for `@comity/pricing`; an issued
  semantics identifier can never be retired without making every record carrying it permanently `unverifiable`.
- *Negative:* application code that relied on the four line mutators or on `OrderUpdate.price` must move to a single
  `setPricedContent` call and supply the adjustments alongside the lines.

## Compatibility and migration

- Semver: **minor** bump under 0.x; written migration note required. No code consumer of `@comity/order` exists in the
  workspace (the `magento` `link:` is not an import), so migration cost is the note itself.
- Error reasons are additive (errors.md §10). Existing reasons are unchanged.
- The status graph and `OrderRepository` surface are unchanged. The pre-existing `order → pricing` edge remains the
  same edge, but OD-8 changed its import classification to **Value** (`value-import`) in ADR-008; no new edge is
  introduced by Phase A. `order → organization` remains type-only.

## Affected packages and consumers

`@comity/order` (contract, entity, errors). No other community package depends on it. Downstream Commerce capabilities
(`@comity/commerce-*`, built later in the Commerce repository, subject to a separate repository/ownership ADR) will
consume the extended `OrderLine`/`OrderId` through the published public API.

## Open questions and governance follow-ups (ADR is Accepted; all governance questions resolved)

1. **Community review + DESIGN.md sign-off.** The accompanying `packages/order/docs/design.md` is a draft; AGENTS.md
   requires explicit review. This ADR must not be marked Accepted until that review completes.
2. ~~Whether `OrderUpdate.price` remaining the sole price-mutation path (draft-only) is preferred over folding price into
   `setLines`~~ — **closed by owner decision OD-7 (Amendment 1):** neither applies. `setPricedContent(lines, adjustments)`
   is the single atomic replacement of all priced content; `OrderUpdate` carries no priced content.
3. Confirmation that `duplicate_item_id` is retained (rather than renamed to `duplicate_line_id`) to avoid a gratuitous
   reason rename — the frozen docs retain it; a rename would be a further break.
4. **[Amendment 1 — CLOSED by owner decision OD-8 (2026-11-05)] ADR-008 value-import exception.** `@comity/order` composes
   its order-level `PriceRecord` at runtime through the public `PriceRecord` API of `@comity/pricing`, which turns the
   registered `order → pricing` edge from type-only into a value import. **The owner approved the narrowly scoped exception**,
   recorded as **ADR-008 "Amendment 1"**, and **formally incorporated (2026-11-06)**: the ADR-008 register classifies the
   edge as **Value** and the machine-readable register records `"importKind": "value"` with the `"value-import"` category.
   No other edge is granted, and implementation was separately authorized (ADR-008 "Amendment 1") and is now released in
   `@comity/order@0.10.0`; no source import or manifest may be widened beyond that authorized implementation.
5. **[Amendment 1 — CLOSED by owner decision OD-10 (2026-11-05)] Record accessor naming.** `historicalInputs()` is
   **approved** as the name of the `PriceRecord` operation that exposes historical inputs, and its contract is now normative
   (ADR-014 §14.4): historical pricing inputs only; never a calculated total price; never a unit price; not sufficient for
   commercial re-sourcing. The identifier is no longer open.
6. **[Amendment 1 — CLOSED by owner decision OD-11 (2026-11-05)] Drafts in an inactive or unsupported currency.** Such a
   draft **MUST NOT be repriced into another currency**; it is abandoned and re-created (ADR-014 §13.1). Committed orders in
   a withdrawn currency remain loadable and historically verifiable, and current currency eligibility remains a
   current-operation constraint, never a reason to reject a stored record.
7. **[Amendment 1 — RESOLVED, governance (2026-11-06)] Whether the amended change set needs a fresh acceptance record.**
   Amendment 1 was recorded after acceptance. The maintainer confirmed on 2026-11-06, in the decision recorded for this
   governance closure, that the existing acceptance of ADR-032 covers Amendments 2 and 3 and that no separate fresh
   acceptance record is required. The amendments refine and reconcile the already accepted Order/Commerce boundary and
   remain governed by the existing accepted architectural decisions. This was an express maintainer confirmation, not an
   inference from implementation, publication, merge history, or the ADR's Accepted status. No separate acceptance event
   is required.

**Resolved on acceptance (2026-11-05).** (1) The Community review of this ADR and the DESIGN.md is complete and recorded in
`comity-community/packages/order/docs/design.md` → "Community review" (verdict `APPROVED WITH CONDITIONS`; all three
conditions are release- or implementation-time and none blocks the start of Phase A). (3) stands **as written**:
`duplicate_item_id` is retained for a duplicate `lineId`.

**(2) is superseded by Amendment 1 (OD-7).** The resolution "`OrderUpdate.price` remains the sole, draft-only
price-mutation path" no longer holds: `setPricedContent` is the single mutation for all priced content, and `OrderUpdate`
carries no priced content at all. Open question 2 is therefore **closed by OD-7**, not by the earlier answer.

## References

ADR-001 (creation vs hydration), ADR-013 (Order entity consolidation), ADR-029/030/031 (Proposed prerequisites),
`errors.md` §10. Authoritative frozen contract:
`commerce/docs/architecture/03-bounded-contexts.md` §3.2, `08-typescript-contracts.md` §4, `12-implementation-roadmap.md`
Phase A, `resolution/architecture-freeze-assessment.md`.
