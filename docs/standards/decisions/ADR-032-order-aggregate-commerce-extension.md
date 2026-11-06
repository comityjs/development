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
deferred `recordReversal` (§5).

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
adapter exists, `version` is advisory** and no production write path that mutates money or rights may ship. This ADR
fixes only the aggregate-side shape of `version`, so it is shaped once; it does not implement ADR-029.

### 5. Explicit exclusions (not in Phase A)

`customer → buyer` rename; `OrderProfile`; `cancel(reason)` and any reason enum (the Order is business-model neutral;
`cancel()` stays argument-free and the application records why); `bundle` subject variant and `BundleGroupRef`;
`stale_version` / `saveWithVersion` / `VersionedRepository`; `origin` / `OrderOrigin` (and `amendment_of`: amendments are
unsupported in v0, reintroduced additively with the first capability that needs them); `Order.recordReversal` and the
reversals collection (deferred, gated on ADR-031/C4); any `@comity/offering` / `@comity/commerce-*` package. These
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
