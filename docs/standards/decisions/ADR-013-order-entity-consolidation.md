# ADR-013 — Order Entity Consolidation

> **Provenance:**
> - Originally: `comity-community/docs/standards/decisions/ADR-013-order-entity-consolidation.md`
> - Migrated to: `comity-development/docs/standards/decisions/ADR-013-order-entity-consolidation.md`
> - Migration: Phase 4
> - Original semantic owner: Comity-wide
> - Canonical owner: comity-development
> - **Amended 2026-11-05 (Amendment 1)** — order persistence and the historical
>   price representation consolidated from architecture-owner decisions **OD-6**
>   (`PriceCurrency`), **OD-7** (atomic priced-content replacement) and **OD-9**
>   (pricing semantics identifiers). Status is unchanged (**Accepted**); this
>   amendment is not a new acceptance and does not authorize implementation.


**Status:** Accepted

## Context

`@comity/order` currently exposes three contracts:

- `OrderModel` — an immutable, `readonly` interface
- `OrderCommands` — a port with `addItem`, `removeItem`, `updateItemQuantity`, `applyCoupon`, `removeCoupon`, `clear`
- `OrderRepository` — `getById(id: string)`, `save(order: OrderModel)`

The module models an aggregate that owns a full lifecycle: identity, state
(`OrderStatus`), explicit non-regressive transitions, invariants (item
quantity, non-empty cart, price aggregation), and domain behavior (currently
hosted on `OrderCommands`). Structurally, however, the aggregate is expressed
as a read-only interface — the shape of a projection — with the domain logic
living outside it in a command port.

This is the "Entity incompleta" drift identified by ADR-012 and the
preceding audits: the technical structure resembles a projection, but the
semantics are those of a lifecycle aggregate.

### Why Order cannot be a Projection

Under ADR-012, a **Projection** is an immutable read model over an entity
whose lifecycle is owned elsewhere — an external system, another bounded
context, or the application layer. `ProductProjection` in `@comity/catalog`
is the canonical example: the catalog does not own the product lifecycle, has
no persistence adapter, and exposes a repository without `save`/`remove`.

`@comity/order` is the opposite:

- `Order` owns its lifecycle: transitions (`draft → pending → confirmed →
fulfilled`, `cancelled`) are Order semantics, not a foreign system's.
- `Order` owns its invariants: quantities, empty-cart, status-transition
  legality.
- `Order` owns its persistence: `OrderRepository.save` exists.
- `OrderStatus` is not an opaque external value; it is a closed union that
  only Order may transition.

There is no external owner to point to. Declaring Order a projection would
attribute its lifecycle to a system that does not exist.

### Difference from ProductProjection

| Aspect          | `ProductProjection`                                              | `Order`                               |
| --------------- | ---------------------------------------------------------------- | ------------------------------------- |
| Lifecycle owner | External commerce backend                                        | `@comity/order` itself                |
| Transitions     | `transitionProductStatus` (pure helper)                          | Order domain methods on the aggregate |
| Persistence     | None (`getById`/`getBySlug`/`search` only)                       | `save` exists                         |
| Identifier      | Primitive `string` (externally owned, Read-Projection Exception) | Owned → `OrderId` Value Object        |
| Mutability      | Read-only by design                                              | Mutable, invariants must be protected |

### Why the current model creates ambiguity

The `OrderModel` + `OrderCommands` split gives developers two homes for the
same concept:

- New developers infer from `OrderModel` that orders are read-only snapshots,
  and from `OrderRepository.save` that they are persisted.
- Invariants are enforceable only if every caller remembers to go through
  `OrderCommands`; nothing prevents mutating or constructing `OrderModel`
  directly.
- The error surface mixes domain conditions with infrastructure and
  not-found reasons (`not_found`, `unknown`, `validation_failed`), so it is
  unclear what an `OrderError` actually represents.
- `OrderRepository` returns `string` ids and `OrderModel`, prefiguring an
  entity it does not model.

Before implementing checkout/payment, the domain must have one coherent shape.

## Decision

### Order è una Entity

`@comity/order` models `Order` as an **Entity** following the canonical
Address/Customer/Identity pattern (ADR-012 §1, `domain-modeling.md` §2, ADR-001):

- `OrderId` — Value Object owned by the module
- `OrderState` — complete persisted state
- `OrderCreate` — explicit construction contract
- `OrderUpdate` — partial modifications
- `OrderSnapshot` — immutable exported representation (`State` + `capturedAt`)
- `Order` — entity class with private state, getters, mutation methods,
  `snapshot()`

## Domain Model

### Order Entity

Responsibilities:

- maintain internal state (`#id`, `#status`, `#items`, `#price`, `#meta`,
  `#createdAt`, `#updatedAt`)
- protect its own invariants
- manage its own transitions

MUST NOT:

- know about Payment
- know about Shipping
- know about Inventory
- validate coupons or know promotion rules
- orchestrate external services

The entity enforces Order-owned invariants only. It does not validate coupons
and knows no promotion rules: coupon validity and the decision to apply a
coupon depend on external context (customer, date, campaigns, usage limits,
segments), so validation and applicability belong to `@comity/pricing` and to
application/domain services. The Order owns only the **applied result**.

> **Amended (Amendment 1, OD-6/OD-7/OD-9).** The applied result is stored as a
> **`PriceRecord`** — a `Price` is a transient calculation product and does not
> cross the persistence boundary (ADR-014 §6, §14). The Order stores, per line and
> once at aggregate level, an immutable `PriceRecord`: its `PriceCurrency`, its
> subtotal, its ordered modifiers, its committed total, and the pricing semantics
> identifier that produced it. `price.modifiers` remains the canonical
> representation of the applied adjustments, but inside the record rather than
> inside a live `Price`. The Order does not store modifiers separately from the
> record and does not recompute them.

The Order holds its monetary context as a **`PriceCurrency`** (`{ code, exponent }`),
not as a `Currency`. `Currency` describes a *currently supported* currency under the
present ISO table and therefore cannot represent a committed amount in a withdrawn
code or in an exponent the table no longer reports; historical restoration must
never be validated against the current table (ADR-014 §2, §13). Current currency
eligibility is enforced only where a **new** amount enters a calculation.

All priced content of a draft — the line collection and the order-level adjustments
together — is replaced by a **single atomic operation**, `setPricedContent`, which
validates the complete replacement, re-derives aggregate price coherence under
current semantics, and applies lines, adjustments and the resulting order record
together. On any failure the aggregate is left completely unchanged (Amendment 1,
OD-7).

Cross-aggregate concerns (pricing recomputation, coupon/promotion validation,
stock reservation, payment authorization) are orchestrated outside the entity
by application/domain services that load, mutate via entity methods, and
persist.

### Lifecycle

Initial state:

```
draft
 ↓
pending
 ↓
confirmed
 ↓
fulfilled
```

Terminal:

```
cancelled
fulfilled
```

Transitions:

```
draft     → pending | cancelled
pending   → confirmed | cancelled
confirmed → fulfilled | cancelled
fulfilled → (terminal)
cancelled → (terminal)
```

Each transition is an explicit entity method (`confirm()`, `cancel()`,
`transition()`) returning `Result`; self-transitions and backwards movement
are rejected.

**Why `fulfilled` and not `completed`:**

`fulfilled` represents the **commercial fulfilment** of the order — the order
has been executed and delivered on the merchant side. `completed` is
ambiguous: it could mean payment, delivery, or administrative closure, each a
different process owned by a different context. The lifecycle vocabulary
therefore uses `fulfilled` as the final forward state.

A future distinction between `fulfilled` and a separate `completed` state is
left open, but only if a real requirement emerges (e.g. administrative
closure distinct from commercial fulfilment). It will not be anticipated.

**Why payment/shipping are not part of `OrderStatus`:**

`OrderStatus` describes the commercial lifecycle of the Order aggregate
itself: drafting, submission, confirmation, fulfilment, cancellation. Payment
and shipping are separate bounded contexts (`@comity/payment`,
`@comity/shipping`) that observe or act on the order; folding their states
into `OrderStatus` would couple the aggregate's own lifecycle to foreign
processes and force `@comity/order` to depend on modules that do not exist
yet. Payment/shipping progress is recorded through their own modules'
contracts (and possibly events), not through Order transitions. If a
`paid`/`shipped` signal is ever required inside the aggregate, it will be
added deliberately together with those modules — as a dedicated decision, not
by leaking their state machines into `OrderStatus`.

### OrderItem Model

> **Historical proposal — superseded by ADR-032 Amendment 3.** `OrderItem` is not the released contract;
> the generic released line is `OrderLine` with `OrderLineSubject`. The rationale below is retained for history.

Decision: `OrderItem` is **NOT an Entity**. It is an **embedded value
structure** of the Order aggregate.

Motivation:

- no independent identity (the line `id` is an intra-aggregate key for
  targeting mutations, not a domain aggregate identifier)
- no lifecycle of its own
- no standalone behavior or invariants outside the aggregate
- no repository
- ownership and mutation semantics belong to Order

This matches how `AddressContact`/`CustomerContact` are modeled inside
`Address`/`Customer` and how `ProductAttribute`/`ProductOption` are embedded
in `ProductProjection`.

### OrderProductSnapshot — Product Snapshot Boundary

> **Historical proposal — superseded by ADR-032 Amendment 3.** The released generic contract uses
> `OrderLineSubject` and does not export `OrderProductSnapshot`. The rationale below is retained for history.

Decision: the product saved in the order is an **owned, immutable snapshot**
(`OrderProductSnapshot`). It is NOT `ProductProjection` from
`@comity/catalog` and it is NOT a reference to the catalog: it is a
self-contained representation of the product at purchase time, stored and
owned by the order. Once the order is created it MUST NOT depend on the
catalog for its content.

```
OrderProductSnapshot:
  - productId?  (catalog reference, when still known)
  - sku         (commercial identity)
  - name        (display name)
  - variant?    (OrderVariantSnapshot: id, sku?, name?, attributes?, options?)
  - attributes? (frozen ProductAttribute values)
  - options?    (frozen ProductOptionSelection values)
  - metadata?   (free-form, e.g. image URL, page URL)
```

The shape mirrors `ProductProjection`, `ProductVariant`, `ProductAttribute`,
and `ProductOption` from `@comity/catalog` **without importing catalog
types**. `@comity/order` MUST NOT `import type { ProductProjection } from
"@comity/catalog"` — that would create an `order → catalog` dependency and
tie the order to the catalog read model.

Boundary rules:

- `@comity/catalog` owns product definition, discovery, merchandising data,
  categories, media references, and the catalog lifecycle. Its contract is
  `ProductProjection`. It MUST NOT know about order, checkout, purchase
  history, or pricing snapshots.
- `@comity/order` owns the historical purchase record, commercial item
  identity, and the purchased-product representation. `OrderProductSnapshot`
  MUST be immutable, self-contained, and independent from the catalog after
  order creation.

Composition flow:

```
Catalog (ProductProjection)
      |
      v
Application / Checkout (maps ProductProjection → OrderProductSnapshot)
      |
      v
Order (stores owned snapshot)
```

The application/checkout maps catalog data into the owned snapshot at
creation time; the order never queries the catalog afterwards.

Pricing follows the same principle: the application/checkout maps `Price`
from `@comity/pricing` into the order, and the order stores the applied
result without requiring the pricing engine, inventory, or tax services after
creation. `@comity/pricing` is the single owner of price composition data:
`Price` carries `subtotal`, `modifiers`, and `total` together, and the order
stores the full immutable `Price` value (line item and order level).

> **Amended (Amendment 1, OD-6/OD-9).** The sentence above is **superseded**: the order stores an
> immutable **`PriceRecord`** (currency + subtotal + ordered modifiers + committed total + pricing
> semantics identifier) at line and aggregate level, because a `Price` cannot be persisted or
> restored with its historical total (ADR-014 §6, §14). Pricing composition data remains owned by
> `@comity/pricing`, and the order still duplicates nothing — but the stored form is the record,
> and `PriceSnapshot` is an in-memory/rendering capture, not a persistence form.

> **Superseded by ADR-032 Amendment 3 (released in `@comity/order@0.10.0`).** The product-oriented
> `OrderProductSnapshot`/`OrderItem` line model below is historical. The released generic contract uses
> `OrderLine` with `OrderLineSubject`. The persistence representation is `PriceRecord`; `PriceSnapshot` is an
> in-memory/rendering capture and is **not** a persistence form (ADR-014 §7). The historical rationale is
> retained below.

Order
contracts do NOT duplicate pricing concepts — there is no separate
`modifiers` storage; modifiers are accessed exclusively through
`price.modifiers`. The line item is conceptually `{ product:
OrderProductSnapshot; price: Price; quantity }`; `quantity` remains the
existing `number` field until a dedicated decision introduces a `Quantity`
value object. `PriceSnapshot` (`Price` + `capturedAt`, ADR-014 §7) is an
in-memory/rendering capture only; it is **not** a persistence form. The
persistence representation is `PriceRecord`.

Guiding principle (see `domain-modeling.md` §11):

> An aggregate may consume another module's data during creation, but it must
> not retain a dependency on that module's read model. Historical aggregates
> store owned snapshots.

Rationale: the order must remain stable and renderable for historical order
rendering, customer support, invoice generation, and returns workflows
regardless of later catalog edits, deletions, or price changes.

The dependency register (ADR-008) lists `order → pricing` as **Value**
(`importKind: "value"`, category `value-import`; OD-8 formally incorporated);
`order → catalog` is **not** registered and MUST NOT be added.

### Historical Snapshot Boundary — Customer, Address, Payment

The product snapshot rule extends to every purchase fact: the order is the
historical aggregate and must not retain a dependency on any external
aggregate. The same principle stated above (`domain-modeling.md` §11 —
historical aggregates store owned snapshots) applies to the buyer, the
addresses, and the payment.

Order owns three additional **local, immutable snapshots** — plain data that
mirrors the external modules' shapes **without importing their types**:

```
OrderCustomerSnapshot:
  - customerId?  (customer reference, when still known)
  - displayName
  - contacts?    (OrderContact: type, value)
  - capturedAt

OrderAddressSnapshot:
  - addressId?           (address reference, when still known)
  - role                 ("shipping" | "billing")
  - lines                (plain string[] lines)
  - city, administrativeArea?, postalCode, countryCode
  - capturedAt

OrderPaymentSnapshot:
  - paymentId?   (payment reference, when still known)
  - amount       (Money, from @comity/pricing)
  - status       ("authorized" | "captured" | "failed" | "cancelled")
  - provider?, reference?
  - authorizedAt?, capturedAt?
```

Boundary rules:

- `@comity/order` MUST NOT `import type { Customer } from
  "@comity/customer"`, nor `import type { Address } from "@comity/address"`,
  nor any type from `@comity/payment` (which does not yet exist). Each of
  `customer → order`, `address → order`, `payment → order` (in the reverse
  direction) is forbidden; the order owns only these local copies.
- `displayName`/`contacts`/address fields are **display and reconciling
  facts**, not operational state: preferences, lifecycle metadata, and
  payment processing capabilities are deliberately not copied.
- The order stores the buyer and addresses **at creation** (`OrderCreate`).
  They are immutable after creation and MUST NOT be mutated through the
  generic `update()` path.
- The payment fact may arrive **after** order creation (a payment is
  processed by the Application layer while the order may still be `pending`).
  It is attached through a dedicated entity method (`attachPayment`), not
  through generic `update()` — recording a historical fact is not a generic
  mutation, and payment snapshots may be accumulated.
- Attaching a payment snapshot creates **no** `order → payment` dependency
  and grants the order **no** payment behavior: it stores the outcomes only.

Composition flow:

```
Customer → Application maps → OrderCustomerSnapshot → Order
Address  → Application maps → OrderAddressSnapshot  → Order
Payment  → Application maps → OrderPaymentSnapshot   → Order (attach after)
```

The Application Layer performs all mapping; the order never queries the
customer, address, or payment modules afterwards.

### Repository Contract

```
interface OrderRepository {
  getById(id: OrderId): Promise<Result<Order | null, RepositoryError>>
  search(criteria?: OrderSearchCriteria): Promise<Result<OrderSearchResult, RepositoryError>>
  save(order: Order): Promise<Result<void, RepositoryError>>
}
```

Rules:

- **not found → `null`** — never an error, never a `not_found` reason
- **no `remove`/`delete`** — the terminal states are `cancelled` and
  `fulfilled`; physical deletion is not a domain operation
- **no repository/domain error inside the repository contract** — the
  repository returns `Result<T, RepositoryError>`; domain failures belong to
  entity methods and domain services, never to the repository
- `OrderSearchCriteria` / `OrderSearchResult` are defined inside the module
  (pattern `CustomerSearchCriteria`) and do not reuse `@comity/search` types

**Monetary persistence and restoration rules (Amendment 1, OD-6/OD-9).** The
repository contract is unchanged; what it must carry is now explicit:

- **`PriceRecord` is the persisted monetary representation** of every line and of
  the aggregate. A `Price` MUST NOT be persisted, and no adapter may reconstruct a
  `Price` from stored data (ADR-014 §6, §14).
- **`PriceCurrency` is persisted verbatim**: its `code` and, mandatorily, its
  `exponent`. The exponent MUST NOT be re-derived from the current ISO table on
  read.
- **Restoration is structural only.** Loading an order MUST NOT validate its
  currency against the current table, MUST NOT recompute any monetary amount, and
  MUST NOT repair a stored total. Historical monetary data is a fact, not a
  derivation.
- **Persisted amounts are integer minor units.** An adapter MUST preserve `bigint`
  precision losslessly (for example as a decimal string); no floating-point
  round-trip is conformant.
- **The semantics identifier is persisted with each record** and is never inferred
  from the installed package version (ADR-014 §14.1).
- **Aggregate price coherence is asserted, not derived, on read.** For a committed
  order the stored order-level record is authoritative; recomputation is never a
  substitute for it.

### Error Semantics

Aligned with ADR-012 §4 and `errors.md`. One error class (`OrderError`), one
finite reason union, codes `order:<reason>`.

Forbidden:

- `not_found` — replaced by `null` from the repository
- `unknown` — generic fallback
- `validation_failed` — replaced by the precise domain reason

`OrderError` historically contained these domain conditions; the list is not exhaustive after Phase A:

- `invalid_quantity`
- `invalid_status_transition`
- `invalid_item`

> **Historical inventory — not exhaustive after Phase A.** The released `@comity/order@0.10.0` error union has
> **ten** reasons: the six original reasons (`invalid_quantity`, `invalid_item`, `invalid_status_transition`,
> `shipping_destination_immutable`, `ambiguous_shipping_destination`, `duplicate_item_id`) plus
> `currency_mismatch`, `price_incoherent`, `commitment_immutable`, and `payment_fact_conflict`. `invalid_buyer`
> was withdrawn by ADR-032 Amendment 3.

Explicitly NOT included:

- `repository_error` — belongs to the infrastructure layer
  (`RepositoryError` from `@comity/primitives`)
- `insufficient_stock` — belongs to `@comity/inventory`
- `product_not_available` — a catalog/inventory condition, not Order-owned
- `coupon_invalid` — coupon validation is not an Order-owned invariant; it
  belongs to `@comity/pricing` and application/domain services

Domain services that orchestrate external modules translate those modules'
failures into the appropriate module error or `RepositoryError`; they do not
invent Order reasons for foreign invariants.

### OrderCommands

Analysis: `OrderCommands` currently mixes two responsibilities:

1. **Order-owned invariants** — quantity bounds, item validity, status
   transitions on the aggregate. These belong **on the Entity** as methods.
2. **Orchestration** — pricing recomputation, coupon/promotion validation,
   inventory checks, (future) payment coordination. These belong **outside
   the Entity**, in application or domain services.

Decision: `OrderCommands` is **no longer a public domain boundary** of
`@comity/order`. It is not a public API of the module. The behavior that
protects the Order's own invariants moves **onto the Entity** (`confirm()`,
`cancel()`, `transition()`).

Future command objects (`CreateOrderCommand`, `ConfirmOrderCommand`,
`CancelOrderCommand`) **belong to the application layer**, not to
`@comity/order/domain`. They are application concerns that orchestrate
external modules and call entity methods before persisting via
`OrderRepository`. ADR-002 remains valid: the repository stays a pure
persistence port, and domain behavior does not live on it.

### Deferred Decisions — Domain Events

Decision: `Order` does **not** depend on an `EventBus`.

The possible domain events `OrderConfirmed`, `OrderCancelled`,
`OrderFulfilled` will be introduced **only when real consumers exist**
(payment, inventory, notification). They are not emitted speculatively.

The Entity must not emit infrastructure events directly: any future event
publication is handled outside the entity (application/domain services),
keeping the domain free of infrastructure coupling.

### Value Objects

#### Necessari ora

- **OrderId** — owned aggregate identity, canonical Value Object
  (validation, `equals()`, `toString()`), per ADR-012 §2.

#### Futuri

- **OrderNumber** — human-readable order reference assigned by checkout; not
  needed until checkout exists. Introduced with the checkout feature.

#### Esterni

- **Money**
- **Currency**

belong to `@comity/pricing`. `Order` consumes them; it does not own or
redefine them.

#### Non necessari

- **SKU** — a primitive reference inside `OrderProductSnapshot.sku`; no
  Order-owned validation semantics. SKU ownership is not assigned to this
  module.
- **Status** — `OrderStatus` is a closed union literal; membership is already
  enforced by the type system, and a VO would add no validation.

## Consequences

**Benefici:**

- uniform model with `Customer`/`Address`/`User` — one pattern to learn
- invariants enforced at the aggregate boundary instead of by convention
- unambiguous naming (`OrderState`/`Create`/`Update`/`Snapshot`, `OrderId`,
  `OrderSnapshot`)
- error surface expresses only Order domain conditions
- correct foundation for checkout/payment without a mid-stream redesign

**Costi:**

- breaking public API change for `@comity/order` (rename `OrderModel`,
  `OrderRepository` signature, `OrderStatus` with `fulfilled` retained as
  final state, `OrderErrorReason` union) — MAJOR bump, follows the
  breaking-change process
- migration of the error tests and introduction of entity tests
- new entity implementation (`Order`, `OrderId`, transitions)
- `OrderCommands` consumers (none in-repo today) must move to entity methods
  - services

**Amendment 1 (OD-6/OD-7/OD-9) — consequences:**

- a committed order keeps its exact monetary facts across a currency withdrawal, an
  exponent change, or a future change of pricing arithmetic; historical truth no
  longer depends on the live currency table or the installed calculation engine
- priced content is replaced atomically, so a failed replacement cannot leave an
  order partially repriced
- **cost:** breaking change to `@comity/order` beyond Phase A — `OrderData.currency`
  becomes `PriceCurrency`, and the line/aggregate price fields become `PriceRecord`
- **cost:** the aggregate composes records through `@comity/pricing` at runtime via a
  narrow ADR-008 value-import exception. **Owner-approved (OD-8)**, recorded as ADR-008
  "Amendment 1" and **formally incorporated**; the machine-readable register records **Value** /
  `value-import`, and the value import is implemented and released in `@comity/order@0.10.0`.
- **cost:** adapters carry a new obligation — persist `PriceRecord` with its
  exponent and semantics identifier, preserve `bigint` precision, and never
  recompute or repair a stored amount on read

## Migration Plan

1. This ADR (status Proposed → Accepted after review)
2. Introduce `OrderId` Value Object (+ tests)
3. Introduce `Order` entity, `OrderState`/`Create`/`Update`/`Snapshot`,
   `domain/order-transitions.ts` (+ tests, canonical pattern)
4. Migrate `OrderRepository` to `OrderId`/`Order`, add `search` with local
   criteria, keep `null` for not-found, no `remove`
5. Migrate `OrderError` to the domain-only union; rewrite error tests
6. Remove `OrderModel` (and dissolve `OrderCommands`; keep input contracts
   on entity methods/services)
7. Update consumers/tests; align docs (repository inventory in comity-community),
   ADR-012 follow-up list); build, test, typecheck, coverage

## Open Questions

- **OrderNumber** — introduce with the checkout feature (recommended), not
  before
- **Money/Currency** — ownership confirmed in `@comity/pricing`; introduced
  there (ADR-014) so Order consumes them. **Superseded by Amendment 1:** the order
  stores an immutable `PriceRecord`, not a `Price`; `PriceSnapshot` (`Price` +
  `capturedAt`, ADR-014 §7) is an **in-memory/rendering** capture and is *not* a
  persistence form. The earlier characterization of `PriceSnapshot` as a
  "persistence form" is withdrawn — `Price` does not cross the
  persistence boundary (ADR-014 §6, §14).
- **Historical price representation** — closed by Amendment 1 (OD-6/OD-9):
  `PriceRecord` + `PriceCurrency` in `@comity/pricing`, with a pricing semantics
  identifier per record. Order-side persistence and restoration rules are stated
  under "Repository Contract". `historicalInputs()` naming (OD-10) and the policy
  for drafts whose currency has been withdrawn (OD-11) are **closed in ADR-014**
  (§14.4 and §13.1; recorded as CLOSED in its Open Questions).
- **payment lifecycle** — `attachPayment` appends historical payment facts;
  multiple payment facts are allowed. A `paid` signal (if ever needed inside
  the aggregate) is a dedicated decision with `@comity/payment`, not a leak
  into `OrderStatus`
- **inventory reservation** — coordination and stock invariants belong to
  `@comity/inventory`; Order exposes product `sku` references only

## References

- `docs/standards/domain-modeling.md` — entity, lifecycle, snapshot,
  repository, read-projection rules
- `docs/standards/decisions/ADR-012-standard-domain-modeling.md` — object
  taxonomy, error semantics
- `docs/standards/decisions/ADR-001-entity-creation-and-hydration.md` —
  constructor/hydration pattern
- `docs/standards/decisions/ADR-002-repository-vs-domain-command.md` —
  repository as persistence port
- ADR-008 — Explicit Core Module Composition Exceptions (Community-specific register instance in comity-community)
  — `order → pricing` register. **"Amendment 1"** records the **owner-approved (OD-8)** narrow value-import
  exception; it is **formally incorporated** (2026-11-06): the register classifies the edge as **Value** and the
  machine-readable register records `"importKind": "value"` with the `"value-import"` category. The import is
  implemented in `@comity/order@0.10.0`.
- `docs/standards/decisions/ADR-014-pricing-domain-model.md` — `Money`/`Currency`/
  `Price` ownership, and `PriceCurrency`/`PriceRecord`/pricing semantics identifiers
  (§13, §14) on which Amendment 1 depends
- `docs/standards/decisions/ADR-032-order-aggregate-commerce-extension.md` — the
  Phase A contract; `setPricedContent` (OD-7) and the `PriceRecord` migration are
  recorded there as Amendments
- `packages/address`, `packages/customer`, `packages/identity` — canonical
  entity implementations
- `packages/catalog` — `ProductProjection` (contrast case)
