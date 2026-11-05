# ADR-032 — `@comity/order` Aggregate Extension for the Commerce Foundation (Phase A)

> **Provenance:**
> - Canonical owner: comity-development
> - Runtime owner: comity-community (`@comity/order`)
> - Raised by: Commerce Foundation v0, Phase A (`commerce/docs/architecture/`, frozen 2026-11-04)

**Status:** Proposed

## Context

The Commerce Foundation v0 architecture (`commerce/docs/architecture/`, frozen 2026-11-04) is built by **extending the
existing `@comity/order` aggregate in place** rather than introducing a parallel `CommerceOrder` or a universal cart.
`@comity/order` already exists in comity-community, is published (0.9.0, 0.9.1, 0.9.2), is governed by **Accepted ADR-013**
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

- `@comity/order` 0.9.2: `comity.layer: "core"`; dependencies `@comity/organization`, `@comity/pricing`,
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

### 1. The seven approved breaking changes

1. **`items → lines`; `OrderItem → OrderLine`.** The line is the commitment's content; its element type changes, so the
   collection is renamed rather than carrying two representations.
2. **`line.product → line.subject: OrderLineSubjectSnapshot`** — a closed union of **five** variants
   (`physical_good | digital_asset | licence | service | plan`). No `bundle` variant (a bundle is expanded into
   component lines by the application).
3. **`line.priceBasis?: PriceBasis` (optional) and `line.term?: OrderLineTerm` (optional).** `PriceBasis` carries a
   documented **non-exhaustive consumption rule** (consumers tolerate an absent basis and an unknown `source`), so adding
   a `quote` variant later is additive, not breaking. `priceListId`/`offeringId` are opaque, application-owned references
   that create no package dependency.
4. **`Order.create(data, id) → Result<Order, OrderError>`** — the validating creation path (ADR-001). The constructor
   remains the **hydration-only** path (no validation; restores persisted state, including `version`, verbatim).
5. **`order:commitment_immutable`** when lines or price are mutated outside `draft`. Line mutators are
   **`setLines`, `addLine`, `removeLine`, `updateLineQuantity`** (owner decision C-1: these replace
   `setItems`/`addItem`/`removeItem`/`updateItemQuantity`), draft-only, same semantics. `OrderUpdate.price` is accepted
   only in `draft`.
6. **`version: number` in `OrderState`** — read-only on the aggregate (see §4).
7. **The five new error reasons (§2) and the `attachPayment` fact rule (§3).** `attachPayment` **and** `update` now
   return `Result<void, OrderError>` (both can reject). The buyer snapshot gains additive optional `kind?`,
   `legalName?`, `taxId?` (no rename).

### 2. Canonical error inventory — exactly five new reasons

| Reason (`order:`-prefixed) | Invariant | Raised by |
|---|---|---|
| `currency_mismatch` | O-6 | `create`, `setLines`, `addLine`, `updateLineQuantity` |
| `price_incoherent` | O-7 | `create`, `setLines`, `addLine`, `removeLine`, `updateLineQuantity`, `update` |
| `commitment_immutable` | O-8 | `setLines`, `addLine`, `removeLine`, `updateLineQuantity`, `update` (price) outside `draft` |
| `payment_fact_conflict` | O-9 | `create` (supplied `payments`), `attachPayment` |
| `invalid_buyer` | O-11 | `create` |

Existing reasons keep their meaning (`invalid_quantity`, `invalid_item`, `invalid_status_transition`,
`shipping_destination_immutable`, `ambiguous_shipping_destination`, `duplicate_item_id` — the last retained for a
duplicate `lineId`). `stale_version`, `bundle_allocation_incoherent` and `invalid_line_term` do **not** exist. The
over-reversal reason `reversal_exceeds_captured` is **not** in this inventory; it ships later, additively, with the
deferred `recordReversal` (§5).

### 3. Invariants and the payment-fact progression

The aggregate enforces O-1…O-9 and O-11 (authoritative table:
`commerce/docs/architecture/03-bounded-contexts.md` §3.2). In particular:

- **O-11 (buyer coherence, owner decision D-2):** `kind: "organization"` requires `legalName`; `taxId` is valid only for
  organizations (`kind` defaults to `individual`). Enforced in `Order.create`; `order:invalid_buyer`. Buyer validation
  stays on the aggregate; it is not pushed to the application. O-10 (cancellation requires cancellable lines) remains an
  **application** precondition, not an aggregate rule.
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

## Compatibility and migration

- Semver: **minor** bump under 0.x; written migration note required. No code consumer of `@comity/order` exists in the
  workspace (the `magento` `link:` is not an import), so migration cost is the note itself.
- Error reasons are additive (errors.md §10). Existing reasons are unchanged.
- The status graph, `OrderRepository` surface, and `@comity/pricing`/`@comity/organization` edges are unchanged; **no new
  ADR-008 edge** is introduced by Phase A.

## Affected packages and consumers

`@comity/order` (contract, entity, errors). No other community package depends on it. Downstream Commerce capabilities
(`@comity/commerce-*`, built later in the Commerce repository, subject to a separate repository/ownership ADR) will
consume the extended `OrderLine`/`OrderId` through the published public API.

## Open questions (require maintainer decision before this ADR is Accepted)

1. **Community review + DESIGN.md sign-off.** The accompanying `packages/order/docs/design.md` is a draft; AGENTS.md
   requires explicit review. This ADR must not be marked Accepted until that review completes.
2. Whether `OrderUpdate.price` remaining the sole price-mutation path (draft-only) is preferred over folding price into
   `setLines` — a contract-shape detail the DESIGN.md flags.
3. Confirmation that `duplicate_item_id` is retained (rather than renamed to `duplicate_line_id`) to avoid a gratuitous
   reason rename — the frozen docs retain it; a rename would be a further break.

## References

ADR-001 (creation vs hydration), ADR-013 (Order entity consolidation), ADR-029/030/031 (Proposed prerequisites),
`errors.md` §10. Authoritative frozen contract:
`commerce/docs/architecture/03-bounded-contexts.md` §3.2, `08-typescript-contracts.md` §4, `12-implementation-roadmap.md`
Phase A, `resolution/architecture-freeze-assessment.md`.
