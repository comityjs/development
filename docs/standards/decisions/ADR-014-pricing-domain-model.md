# ADR-014 — Pricing Domain Model

> **Provenance:**
> - Originally: `comity-community/docs/standards/decisions/ADR-014-pricing-domain-model.md`
> - Migrated to: `comity-development/docs/standards/decisions/ADR-014-pricing-domain-model.md`
> - Migration: Phase 4
> - Original semantic owner: Comity-wide
> - Canonical owner: comity-development
> - **Amended 2026-11-05** — §§1, 2, 6, 7, 11, 13, 14, Consequences and Open
>   Questions consolidated from architecture-owner decisions **OD-6** (`PriceCurrency`)
>   and **OD-9** (pricing semantics identifiers). Status is unchanged (**Proposed**);
>   this amendment is not acceptance.
> - **Further amended 2026-11-05** — owner decisions **OD-10** (`historicalInputs()` is the approved
>   name and its contract is now normative) and **OD-11** (a draft in an inactive currency is
>   abandoned and re-created) are now **approved** and recorded as rules (§13, §14, Open
>   Questions). **OD-8** (the ADR-008 runtime value-import exception) is **owner-approved** and is
>   recorded in ADR-008 "Amendment 1" and **formally incorporated (2026-11-06)** as a **Value** dependency
>   (`importKind: "value"`, category `"value-import"`). Status remains **Proposed** throughout.
> - **Amended 2026-11-06** — owner-approved amendments **A14-1…A14-11** are incorporated below: the
>   record schema `format` (A14-3) distinct from `semanticsId`, a single-currency record with bare integer
>   minor-unit amounts (A14-2), lossless decimal-string serialization (A14-4), internal `semanticsId`
>   assignment (A14-1), `combine` restricted to commit time (A14-5), structural/semantic/commit-eligibility
>   separation (A14-6), structural-record error reasons (A14-7), and migration completeness (A14-8…A14-11).
>   **Status remains Proposed**; incorporating these amendments is not acceptance.
> - **Accepted 2026-11-06** — formal acceptance on owner authorization (2026-11-06), superseding the pre-acceptance
>   status notes above: the status changes from **Proposed** to **Accepted**. Acceptance does not alter
>   **A14-1…A14-11** or any other decision recorded above.
> - **Further amended 2026-11-06** — owner-approved amendments **A14-12…A14-17** are incorporated in **§14.7**: exact
>   commitment equality over ordered modifiers (A14-12), `combine` line-validation → aggregation → single order-adjustment
>   pass (A14-13), record-form adjustment input (A14-14), part validation under current semantics (A14-15), deterministic
>   failures and empty-input rejection (A14-16), and the approved mathematical properties (A14-17). This amendment does not
>   alter **A14-1…A14-11**, and the acceptance recorded above is unchanged.


**Status:** Accepted

## Context

`@comity/pricing` is currently a contract-only package exposing two ambiguous
`Model` interfaces (`PriceModel`, `PriceModifierModel`) that represent money as
`number` and currency as a raw `string`. This shape violates ADR-012 and cannot
support the consumers that depend on it:

- `@comity/order` (registered in ADR-008) consumes the price contracts. ADR-013
  deferred the definitive pricing-snapshot shape to `@comity/pricing` and named
  `Money`/`Currency` as externally owned Value Objects that Order must consume.
- ADR-012 §5 tracks `*Model` naming in `@comity/pricing` as a follow-up.
- There is no money representation anywhere in the repo: no `bigint`, no
  currency type. Each consumer would otherwise invent its own.

The `Model` suffix is forbidden for aggregate read models (ADR-012 §1), and
`PriceModel` is not a read model over a foreign aggregate — it is a **value
structure** produced by a pricing calculation. Floating-point `number` cannot
represent money safely. A bare `string` currency carries no validation and
leaks raw strings into domain contracts.

This ADR gives `@comity/pricing` a real domain model: Value Objects for
`Currency`, `Money`, and `Percentage`, a `Price` Value Object, a discriminated
`PriceModifier` value structure, a `PriceSnapshot` contract, and a pure
calculation engine. It does **not** introduce persistence, entities, adapters,
generic numeric abstractions, or external dependencies.

## Decision

### 1. Object taxonomy

`@comity/pricing` contains **no Entity and no Repository**. Everything in the
package is either a Value Object or an immutable value structure:

- `Currency` — Value Object (owns monetary precision via its exponent; **current
  currency table only** — see §2 and §13)
- `Money` — Value Object (integer minor units)
- `Percentage` — Value Object (precise rates for percentage adjustments)
- `Price` — Value Object (result of a calculation, total computed internally;
  **transient** — never persisted, see §6 and §14)
- `PriceModifier` — immutable value structure (commercial context descriptor)
- `PriceAdjustment` — immutable value structure (pure mathematical operation)
- `PriceSnapshot` — immutable point-in-time capture (`Price` + `capturedAt`);
  an in-memory/render form, **not** a persistence form (see §7)
- `calculatePrice` — pure domain function
- `PriceCurrency` — **ACCEPTED / IMPLEMENTED** immutable value structure (`{ code, exponent }`): a
  **historical** monetary unit, valid even when the code is no longer in the
  current table (see §13)
- `PriceModifierRecord` — **ACCEPTED / IMPLEMENTED** immutable value structure; the recorded
  counterpart of `PriceModifier`; its monetary amount is a bare `bigint` integer
  minor units value in the enclosing record's `PriceCurrency` (see §14)
- `PriceRecord` — **ACCEPTED / IMPLEMENTED** immutable **historical monetary record**: the
  persisted form of a computed price, including its schema `format`, its
  `PriceCurrency`, integer minor-unit amounts, ordered modifiers, total and
  pricing semantics identifier (see §14)
- `PlainPriceRecord` — **ACCEPTED / IMPLEMENTED** plain, JSON-safe wire form of `PriceRecord`
  (integer minor units as decimal strings; `Percentage` as `(amount, scale)`) used
  for lossless serialization and structural restoration (see §14.6)
- `PriceVerification` — **ACCEPTED / IMPLEMENTED** outcome of re-executing a record's own frozen
  semantics (`verified` / `mismatch` / `unverifiable` — see §14.2)

There is no owned aggregate, no lifecycle, and **no persistence mechanism** in
pricing: no repository, no adapter, no I/O, and no storage of its own. Pricing
never reads or writes a database. Pricing does, however, **own the immutable
shape of a historical price record and the identifiers of its calculation
semantics** (§13, §14), because a persisted price that pricing could not describe
would force every consumer to invent its own money encoding. Pricing computes
values and defines their historical record shape; it does not project or store
data. This keeps the module replaceable and free of infrastructure concerns.

Value Objects in this module follow the **always-valid / no-throw** principle:
constructors are private and never throw; fallible creation is exposed as a
`static create(...): Result<X, PricingError>`, so a Value Object only ever
exists in a valid state.

**No generic numeric abstraction.** `Decimal` is deliberately NOT introduced
for pricing. A generic decimal number is not a pricing domain concept — it was
a technical detail for avoiding floating point. Money is represented correctly
with integer minor units, and percentage rates are owned by a domain-specific
`Percentage`. A generic `Quantity`/`Decimal` does not belong to pricing; if
multiple bounded contexts need a shared numeric or quantity semantics, that is
a new architectural decision in its own module (e.g. a measurement package),
not a pricing concern.

### 2. Currency Value Object

`Currency` is a Value Object in `@comity/pricing` and is the **owner of
monetary precision**:

```ts
Currency {
  code: CurrencyCode;   // e.g. "USD"
  exponent: number;     // e.g. 2
}
```

- validates against the active ISO 4217 code set, which maps every code to its
  minor-unit exponent (`USD` → 2, `EUR` → 2, `JPY` → 0, `KWD` → 3, `BHD` → 3,
  `CLF` → 4)
- accepts input case-insensitively and normalizes to uppercase
- immutable state: `#code` + `#exponent`
- `static create(code: string): Result<Currency, PricingError>` — unknown code
  yields an `invalid_currency` failure (never a throw)
- `code`, `exponent` getters, `equals()`, `toString()`
- the exponent defines the minor unit: one minor unit equals `10^-exponent` of
  one major unit (e.g. 1 cent for `USD`, 1 yen for `JPY`)

Currency does NOT convert currencies, does NOT know exchange rates, and does
NOT apply rounding policy.

**`Currency` is a *current* currency, not a historical one.** The ISO 4217 table
it validates against lists **active** codes only and maps each code to its
**current** minor-unit exponent; historic codes (e.g. `HRK`, `VEF`) are
deliberately absent, and `Currency.create` therefore rejects them. Two
consequences are normative:

- `Currency` MUST NOT be used to represent, restore or validate a **historical**
  monetary fact. A committed amount may be denominated in a code that is no
  longer active, or in an exponent that the current table no longer reports.
- `Currency.equals()` compares the **code only** and is therefore insufficient to
  prove that two amounts share a monetary unit. Historical comparison MUST use
  `PriceCurrency` equality on `(code, exponent)` (§13).

`Currency` is unchanged by this ADR: it retains its present contract. Historical
representation is added *beside* it as `PriceCurrency`, never by weakening it.

Ownership rationale: currency is commerce-domain language. It lives in the
commerce layer (`@comity/pricing`), not in `@comity/primitives`, which must
remain generic and business-free. Domain contracts MUST NOT use a bare
`string` currency.

### 3. Money Value Object

`Money` is a Value Object in `@comity/pricing` using **integer minor units**:

```ts
Money {
  amount: bigint;       // minor units
  currency: Currency;
}
```

- `amount` is an integer count of the currency's minor unit: `amount` 1234
  with `USD` represents 12.34 USD; `amount` 1234 with `JPY` represents 1234
  JPY
- integer minor units keep arithmetic exact — no floating point, no generic
  Decimal type
- immutable state: `#amount: bigint` + `#currency: Currency`
- `static create(amount: bigint, currency: Currency): Result<Money,
  PricingError>` — negative amounts yield an `invalid_amount` failure (never a
  throw)
- **precision coherence** with the currency is inherent to the
  representation: any non-negative integer is a whole number of minor units
  for the currency. The `invalid_precision` reason is reserved for future
  scaled operations (e.g. fractional-quantity calculations that would need a
  rounding policy) and is unreachable with the current API.
- `equals()`, `amount`/`currency` getters, `toString()`

Arithmetic (each returns `Result<Money, PricingError>`):

- `add(other)` — different currencies → `currency_mismatch`
- `subtract(other)` — different currencies → `currency_mismatch`; negative
  result → `invalid_amount`
- `multiply(factor: bigint)` — integer factor; negative factor →
  `invalid_amount`. The product is exact (no rounding).

`Money.multiply` does NOT use `Decimal` and does NOT support fractional
quantities directly. A fractional quantity (kg, meters, consumption, time) is
not a responsibility of `Money`: it belongs to the domain module that owns the
measure, and pricing may introduce a dedicated calculation later if a real
need emerges.

#### Formatting

`toString()` is a stable technical serialization — minor-unit amount then
currency code (`1234 USD`). It is NEVER a display format. Human / localized
rendering (`$20`, `20€`, `€20`, `1000 EUR`) is the responsibility of a
dedicated formatter at the boundaries; `Intl` and locale handling MUST NOT
appear inside `Money`. A `MoneyFormatter` / `CurrencyFormatter` is future work.

### 4. Percentage Value Object

Percent modifiers use a dedicated Value Object, NOT a generic Decimal:

- represents precise percentage rates (`20%`, `12.5%`, `7.25%`)
- internal representation is a scaled integer (the rate is stored as
  `amount / 10^scale` percent, e.g. 12.5% → `amount` 125 at `scale` 1); the
  scaling is hidden from the contract
- `static create(amount: bigint, scale: number): Result<Percentage,
  PricingError>` — negative amount, negative scale, or non-finite scale yields
  an `invalid_percentage` failure (never a throw); fractional scales are
  truncated
- arbitrary non-negative scale (supports sub-basis-point rates such as
  `0.001%`)
- `equals()` is numeric (cross-multiplication): `20.0%` at `scale` 1 equals
  `20%` at `scale` 0
- `toString()` is canonical (`20%`, `12.5%`, `7.25%`), never localized

### 5. PriceModifier value structure

`PriceModifier` is a serializable value descriptor, NOT an entity and NOT a
behavior object. It describes the **commercial context** of an adjustment and
carries the **mathematical operation** in a separate `PriceAdjustment`:

```ts
interface PriceModifier {
  readonly code: string;
  readonly label?: string;
  readonly kind: PriceModifierKind; // "discount" | "charge" | "credit" | "tax" | "other"
  readonly component?: string;       // semantic label, never interpreted by pricing
  readonly adjustment: PriceAdjustment;
}

type PriceAdjustment =
  | { readonly type: "money"; readonly amount: Money; readonly operation: "add" | "subtract" }
  | { readonly type: "percentage"; readonly rate: Percentage; readonly operation: "add" | "subtract" };
```

The `adjustment` field is a **discriminated union** that makes invalid states
impossible by construction:

- a `money` adjustment cannot exist without an `amount`
- a `percentage` adjustment cannot exist without a `rate`
- the `operation` provides the sign — `Money` stays non-negative and
  `Percentage` represents a **real percentage** (e.g. `10%`, never a `90%`
  factor)

Rationale for separating `PriceModifier` from `PriceAdjustment`:

- `kind` is descriptive metadata. Deriving the sign from `kind` would make the
  calculation engine a hidden tax/discount policy. The engine must stay
  neutral: it applies arithmetic, not business meaning.
- The `operation` (`add` / `subtract`) is pure mathematics — it carries no
  business semantics about what the modifier *is*.
- Discounts and credits are `subtract`, fees and taxes are `add`; the same
  modifier kinds remain expressible for both.

Rules:

- `kind` and `component` are validated as structure (known kind, present code,
  coherent adjustment) but are NEVER consulted by the engine
- `percentage` rates are `Percentage` values; a zero rate is rejected at the
  modifier level (`invalid_modifier`); an `add` / `subtract` operation with a
  `money` amount not in the base currency yields `currency_mismatch`
- a money adjustment is always non-negative (`Money` invariant); subtraction
  is expressed via `operation: "subtract"`, never via a negative amount

Forbidden:

- `Discount`/`Tax`/`Coupon`/`Promotion` classes — they are not modeled here
- `Discount`/`Credit` sign conventions derived from `kind` — that would embed
  a checkout policy inside pricing
- a `modifier.apply(price)` behavior — calculation is centralized in the
  pricing engine, never delegated to individual modifiers

### 6. Price Value Object

`Price` is a Value Object, NOT an Entity and NOT a Projection. It lives in
`value-objects/price.ts` next to the other Value Objects; contracts import it
from there:

- it has invariants — `subtotal`, `modifiers`, and `total` must be coherent
- it has no identity and no lifecycle
- the total is computed internally, so an incoherent `Price` (e.g.
  `{ subtotal: 100, total: 500 }`) cannot exist

```ts
class Price {
  static create(subtotal: Money, modifiers: ReadonlyArray<PriceModifier>): Result<Price, PricingError>;
  readonly subtotal: Money;
  readonly modifiers: ReadonlyArray<PriceModifier>;
  readonly total: Money;
}
```

- `create()` validates every modifier, applies them in **input order**, computes
  the total, and stores the applied modifier list
- `subtotal` is the base money before modifiers; `total` is the computed result
- percentage adjustments are `total × rate` rounded half-up to the minor unit;
  the rounding policy lives in the price engine (never in `Currency`)
- `equals()` compares subtotal, modifiers (code, label, kind, component,
  adjustment), and total structurally

`Price` is a **transient calculation product**. It has no serialization contract,
no `toJSON`, and no restoration factory; its constructor is private and its only
creation path is `create(...)`, which always recomputes `total`. A `Price`
therefore cannot be reconstructed with a historical `total`, because no
construction path accepts one.

**Normative consequence: `Price` MUST NOT cross the persistence boundary.** No
adapter may persist a `Price` or rebuild one from stored data. What is persisted
is a `PriceRecord` (§14), which records what `Price.create` produced at the moment
of commitment. This keeps the Value Object's single validation boundary intact
(`docs/standards/domain-modeling.md` §3) and removes any need for a trusted
restoration bypass.

### 7. PriceSnapshot

`PriceSnapshot` replaces the earlier `PriceProjection` concept. Pricing does
not project data — it computes values — so a snapshot is simply a computed
price frozen in time:

```ts
interface PriceSnapshot extends Price {
  readonly capturedAt: Instant;
}
```

The snapshot **extends** the `Price` value itself (following the repo's
snapshot pattern: state + `capturedAt`) rather than wrapping it. A
`PriceSnapshot` is an **in-memory / rendering** capture of a computed price: the
instant it was taken, alongside the values that produced it.

**It is not a persistence form.** `PriceSnapshot` is a structural type alias over
`Price`; because all of `Price`'s state is held in ECMAScript private fields, a
`PriceSnapshot` cannot be materialised by spreading a `Price` and cannot be
serialized at all. Persisting history is the job of `PriceRecord` (§14), which is
plain immutable data. No adapter may store a `PriceSnapshot` as the historical
representation of a committed amount.

### 8. calculatePrice engine

```ts
calculatePrice(base: Money, modifiers: ReadonlyArray<PriceModifier>): Result<Price, PricingError>
```

- deterministic, pure, no I/O, no repositories, no adapters
- delegates to the controlled creation of `Price` (the engine logic is
  encapsulated in `Price.create`, which computes the total internally)
- validates every modifier (`invalid_modifier` for structural problems,
  `currency_mismatch` when a `money` `amount` is not in `base`'s currency)
- applies modifiers in **input order** — the engine never reorders them;
  application order is fully controlled by the consumer
- the engine interprets ONLY `adjustment.type` and `adjustment.operation`:
  `money` moves the running total by an exact amount, `percentage` moves it by
  `current × rate`; the `operation` provides the sign. `kind` and `component`
  are never consulted
- percentage adjustments are rounded half-up to the minor unit of the running
  total
- if a subtractive adjustment would drive the running total below zero →
  `calculation_failed` (a price can never be negative)
- empty `modifiers` returns a price whose total equals the base

The engine does NOT know tax rules, coupon policy, orders, or catalog. Whether
a discount applies to the subtotal or to a tax-inclusive amount, which modifiers
are legal together, and how checkout composes them is decided by the consumer /
application — never by pricing.

### 9. PricingError

One error class, one finite reason union, codes `pricing:<reason>`
(`errors.md` §3).

Allowed:

- `invalid_currency`
- `invalid_amount`
- `invalid_precision`
- `currency_mismatch`
- `invalid_percentage`
- `invalid_modifier`
- `calculation_failed`
- `unsupported_record_format` — additive; the structural schema `format` of a stored record is not supported

Forbidden (aligned with ADR-012 §4):

- `not_found` — not-found is not a pricing condition
- `unknown` — no generic fallback
- `validation_failed` — replaced by the precise reasons above
- `repository_error` — pricing has no repository

`invalid_precision` is reserved for future scaled operations; it is
unreachable with the current integer-minor-unit API. `invalid_decimal` is NOT
part of the model — there is no generic decimal concept in pricing.

**Structural-record failures (A14-6/A14-7).** Restoring a `PriceRecord` from stored data can fail **structurally**
before any semantic question is asked. Field-level malformations reuse the existing reasons: `invalid_currency`
(empty/invalid `code`), `invalid_amount` (negative or non-integer minor-unit amount), `invalid_percentage`
(malformed percentage), `invalid_modifier` (malformed recorded modifier). An unsupported or higher record schema
`format` uses the additive reason `unsupported_record_format`. These failures are **distinct** from
`PriceVerification`'s `unverifiable` outcome (§14.2) and from current commit eligibility: a structurally invalid
record is not a valid record, whereas a structurally valid record with an unknown `semanticsId` remains readable
and is merely `unverifiable`.

`PricingError` extends `BaseError` from `@comity/primitives` and is exported
from the `@comity/pricing/errors` subpath, following the `@comity/catalog`
pattern.

### 10. Naming migration

- `PriceModel` → `Price` (now a Value Object in `value-objects/price.ts`)
- `PriceModifierModel` → `PriceModifier` (commercial context descriptor)
- `PriceModifierValue` (interim) → `PriceAdjustment` (mathematical operation,
  discriminated by `type` with an explicit `add` / `subtract` `operation`)
- `number` money → `Money` with integer minor units (`amount: bigint`)
- `Decimal` (interim) → removed entirely; percentage rates now use `Percentage`
- `invalid_quantity`/`invalid_decimal` (interim) → `invalid_precision` /
  `invalid_percentage`
- `PriceProjection` → `PriceSnapshot`
- No aliases, no `*Model` suffix retained (ADR-012 §1)

This is a breaking public API change for `@comity/pricing` (MAJOR bump,
breaking-change process): constructors → `static create(): Result`, `Money`
amount → integer minor units, `PriceModifier.basis/amount?/rate?` →
`PriceModifier.adjustment` discriminated union with explicit operation, `Price`
interface → Value Object, `PriceProjection` → `PriceSnapshot`. The only
in-repo consumer (`@comity/order`, type-only) is migrated in the same change.

### 11. Cross-module dependencies

- `@comity/pricing` depends on `@comity/primitives` only.
- `pricing → order` is forbidden: pricing never knows the order.
- `order → pricing` is registered in ADR-008 and **formally incorporated (2026-11-06)** as a **Value** dependency, limited
  to the public record types (`PriceRecord`, `PriceCurrency`, `PriceModifierRecord`) and `combine`; every other pricing
  concept stays type-only (`Price`, `PriceModifier`, `Money`, and transitively `Currency`).
- **INCORPORATED / IMPLEMENTED — OD-8 (owner-approved 2026-11-05; incorporated 2026-11-06).** Composing an
  order-level `PriceRecord` from its line records (§14) requires `@comity/order` to call `PriceRecord.combine(...)` and
  record the current semantics identifier at runtime. The architecture owner approved a value import limited to the
  public `PriceRecord`, `PriceCurrency`, `PriceModifierRecord` types and `combine`, recorded as **ADR-008
  "Amendment 1"**, and it is now incorporated: the ADR-008 register classifies the edge as **Value** and its
  machine-readable register records `"importKind": "value"` with the `"value-import"` category. The exception is
  implemented in the released `@comity/order@0.10.0` package. Three limits apply and must be stated together:
  (i) the import remains limited to those public record types and `combine`; (ii) the import stays narrow — `order`
  never reads pricing internals, never accesses the retained-semantics table (§14.3), never calls `verify()`, and has
  no aggregate-side `from`; (iii) `order` persists the `PriceRecord`, never the calculated `Price`, and
  `@comity/pricing` remains the owner of price-record semantics and transformations. No cycle is involved:
  `@comity/pricing` depends on `@comity/primitives` only (`pricing → order` stays forbidden).
- The earlier statement that implementation was separately authorized and that the value import was absent from the
  codebase is historical pre-release language. The released implementation uses the runtime import; it does not add
  `verify()`, access the retained-semantics table, or introduce an aggregate-side `from`.
- `catalog → pricing` is NOT added today: catalog exposes no prices yet. It
  will only be registered when a `ProductProjection` includes a
  `PriceSnapshot`.
- `tax → pricing` will only be considered when a `@comity/tax` module exists.

### 12. Currency conversion (future work)

Conversion is NOT a `Money`/`Currency` responsibility: there is no
`money.convert(Currency)` API, and `Currency` knows no rates.

A future **domain service** in `@comity/pricing` will own conversion:
`ExchangeRate`, `ExchangeRateProvider`, `CurrencyConverter`. Not implemented
now; tracked as an architectural TODO. Requires a dedicated ADR when the
requirement lands.

### 13. Historical monetary representation (`PriceCurrency`, recorded amounts)

A committed amount is a **historical fact**. It must remain readable when the
currency code is withdrawn, when the current table reports a different exponent,
or when the installed package version is much newer than the record. `Currency`
(§2) cannot express any of these cases, so historical monetary representation is
a **separate** value structure rather than a relaxation of `Currency`.

```ts
// ACCEPTED / IMPLEMENTED — current historical-currency contract (A14-1…A14-17).
interface PriceCurrency {
  readonly code: string;      // uppercase ISO 4217 code, exactly as committed
  readonly exponent: number;  // minor-unit exponent, exactly as committed
}

// Recorded amounts are bare `bigint` integer minor units in the enclosing
// PriceRecord.currency (A14-2); there is no per-amount currency wrapper.
```

**The five concepts MUST be kept distinct.** Conflating any two of them is the
defect this section exists to prevent:

| Concept | Representation | Who validates it |
| --- | --- | --- |
| Historical currency identity | `PriceCurrency.code`, verbatim | nobody — it is a recorded fact |
| Historical monetary unit | `PriceCurrency.exponent`, verbatim | nobody — it is a recorded fact |
| Historical amount | the record's integer minor-unit amount (`bigint`), in *that* unit | nobody — it is a recorded fact |
| Current calculation eligibility | `Currency.create(code)` succeeds **and** its exponent equals the record's | the **calculation entry point only** |
| Conversion to current `Money` | an explicit, named, **fallible** operation | the caller that genuinely needs current `Money` |

Normative rules:

- **Historical restoration MUST NOT validate against the current currency table.**
  A record whose code is no longer active, or whose exponent the table no longer
  reports, MUST still load. Restoration is structural only.
- **Historical records MUST preserve their original exponent.** The exponent is
  part of the record, not something re-derived at read time.
- **No implicit normalization and no implicit conversion** is permitted. An
  exponent MUST NOT be normalized to the current value, and an amount MUST NOT be
  silently rescaled.
- **Conversion to current `Money` is explicit and fallible.** It is permitted only
  through a named operation that can fail when the code is not currently
  representable, and it is never invoked on a restoration path.
- **`PriceCurrency` equality is structural on `(code, exponent)`.** `Currency.equals()`
  compares the code only (§2) and MUST NOT be used to decide whether two recorded
  amounts share a monetary unit.
- **`Currency` is unchanged.** Historical representation is added beside it; the
  current-currency contract is not weakened, and `Currency.create` keeps rejecting
  inactive codes.
- **A malformed stored record is a load failure, not a valid record (A14-6).** Structural validation of a
  `PriceRecord` (non-empty `code`, integer `exponent >= 0`, non-negative integer amounts, well-formed ordered
  modifiers, supported `format`) runs **before** any semantic question. A failure is a structural error (§9)
  and the record is never "repaired" or coerced. This is distinct from `PriceVerification`'s `unverifiable`
  (§14.2), which applies only to a structurally valid record whose `semanticsId` cannot be re-executed.

**Current calculation eligibility stays explicit and separate.** Exactly one
current operation applies today's rules, and it is the only place a *new*
currency may enter a calculation:

```ts
// ACCEPTED / IMPLEMENTED — succeeds only for a code in the current active table.
function currentPriceCurrency(code: string): Result<PriceCurrency, PricingError>;
```

It MUST NOT be called on any restoration path, and it MUST NOT be used to
re-validate a stored record.

**Consequences for the Order aggregate (owner decision OD-6).** `OrderData.currency`
uses `PriceCurrency`, not `Currency`:

- a restored order never validates its currency against the current table;
- an **empty draft** still carries an explicit currency representation, because the
  order's currency cannot be derived from price records when there are no lines;
- currency compatibility (Order invariant O-6) is decided on `(code, exponent)`.

#### 13.1 Drafts whose currency is no longer supported (owner decision OD-11 — APPROVED)

A currency can be withdrawn, or become unsupported by the installed table, **between** the creation of a draft and its
submission. The three populations must be treated differently, and none of the handling may convert or reinterpret an
amount:

| Population | Rule |
| --- | --- |
| **Historical committed orders** (`pending`, `confirmed`, `fulfilled`, `cancelled`) | **Remain loadable and historically verifiable.** They are never validated against the current table, never recomputed, never converted, and never rejected because their currency is no longer supported. `PriceRecord.verify()` and its retained semantics (§14) are independent of the live currency table. |
| **Drafts in an inactive or unsupported currency** | **MUST NOT be repriced into another currency.** The aggregate has no currency mutation, and adding one is out of scope. Such a draft is **abandoned and re-created** in a supported currency by the application. |
| **Current currency eligibility** | Remains a **current-operation** constraint: it gates a *new* calculation (via `currentPriceCurrency`), never the acceptance of an existing record. |

Rules that follow, and are normative:

- **No implicit conversion.** A withdrawn-currency amount is never converted to another currency, and `exponent` is never
  reinterpreted to make a record fit the current table.
- **No currency mutation on the aggregate.** `Order` exposes no operation to change its `PriceCurrency` after creation
  (ADR-013: the currency is fixed at creation). Abandoning the draft is the only supported path, and it requires no new
  aggregate operation and no new lifecycle transition.
- **Abandonment is the application's action**, using the existing `cancel()` on the draft and creating a replacement order.
  The Order aggregate is unchanged by this rule; the decision is where the responsibility sits, and it sits **outside** the
  aggregate.
- **Committed orders are never "fixed".** Being unable to *start* a new calculation in a withdrawn currency is correct
  behaviour, not a defect to be repaired.

### 14. `PriceRecord` and pricing semantics identifiers

`PriceRecord` is the **historical persistence representation** of a computed
price. It is plain immutable data — constructible, serializable and comparable —
and it is what every consumer persists instead of `Price` (§6) or `PriceSnapshot`
(§7). It carries a schema **`format`** (the shape/version of the record itself,
§14.5) that is **distinct from `semanticsId`** (the calculation pipeline, §14.1).
Its amounts are integer minor units in one `PriceCurrency`; there is no
per-amount currency wrapper (A14-2).

```ts
// ACCEPTED / IMPLEMENTED — current record shape (A14-1…A14-17).
interface PriceModifierRecord {
  readonly code: string;
  readonly label?: string;
  readonly kind: PriceModifierKind;              // reused from §5
  readonly component?: string;
  readonly adjustment:
    | { readonly type: "money";      readonly amount: bigint;   readonly operation: AdjustmentOperation }
    | { readonly type: "percentage"; readonly rate: Percentage; readonly operation: AdjustmentOperation };
  // `money.amount` is integer minor units in the enclosing PriceRecord.currency.
}

interface PriceRecord {
  readonly format: 1;                                       // record schema/format — see §14.5 (A14-3)
  readonly currency: PriceCurrency;                         // the ONE monetary unit for every amount below
  readonly subtotal: bigint;                                // integer minor units in `currency`
  readonly modifiers: ReadonlyArray<PriceModifierRecord>;   // input order is semantic
  readonly total: bigint;                                   // the committed fact, integer minor units in `currency`
  readonly semanticsId: number;                             // calculation pipeline — see §14.1
}
```

`Percentage`, `PriceModifierKind` and `AdjustmentOperation` are **reused**, not
duplicated: `Percentage` carries no currency and restores exactly from
`(amount, scale)`. Monetary amounts are **bare `bigint` integer minor units** in
`PriceRecord.currency`; the single top-level currency makes an inconsistent
record unrepresentable (A14-2).

Current operations:

```ts
// ACCEPTED / IMPLEMENTED — current record operations (A14-1…A14-17).
// Records what `Price.create` produced at the moment of commitment. ONE-WAY.
// Stamps the CURRENT semanticsId and the current record `format` internally — the
// caller cannot choose either (A14-1). If `currency` is supplied it MUST equal the
// price's own `(code, exponent)`; otherwise it fails with `currency_mismatch`.
PriceRecord.from(price: Price, currency?: PriceCurrency): Result<PriceRecord, PricingError>;

// COMMIT-TIME ONLY (A14-5, A14-13). Composes an order-level record from finalized
// line records (parts). Each part is validated under CURRENT semantics (A14-15);
// its line modifiers are provenance and are NEVER re-applied (A14-13).
// `adjustments` are order-level and are applied exactly ONCE, in order, after
// aggregation. NO currency parameter: the currency is derived from the parts.
// Fails when parts disagree on (code, exponent), on semanticsId, or on format,
// when a part is not coherent/eligible under CURRENT semantics, or when `parts`
// is empty (A14-16). MUST NOT be called on a restoration path.
PriceRecord.combine(
  parts: ReadonlyArray<PriceRecord>,
  adjustments: ReadonlyArray<PriceModifier | PriceModifierRecord>
): Result<PriceRecord, PricingError>;

// APPROVED NAME (OD-10). Exposes historical pricing inputs ONLY. Never a
// calculated total price, never a unit price. Sufficient for arithmetic
// re-base; NOT sufficient for commercial re-sourcing. See §14.4.
PriceRecord.historicalInputs(record: PriceRecord): {
  readonly subtotal: bigint;                                // integer minor units in record.currency
  readonly modifiers: ReadonlyArray<PriceModifierRecord>;
  readonly semanticsId: number;
};

// Re-executes the record's OWN frozen semantics. Never mutates. Never falls back.
PriceRecord.verify(record: PriceRecord): PriceVerification;

// Structural (de)serialization — lossless wire form (§14.6, A14-4/A14-6).
// No current-currency validation, no recomputation, no repair.
PriceRecord.toPlain(record: PriceRecord): PlainPriceRecord;
PriceRecord.restore(plain: unknown): Result<PriceRecord, PricingError>;
```

`combine()` **derives** the currency from its input records and accepts no
independently supplied currency. This makes it structurally impossible to conflate
a historical currency with a current one by argument, and it turns accidental
mixing of incompatible codes or exponents into an explicit failure instead of a
silent `bigint` sum. Derivation also removes the empty-order ambiguity: the
aggregate's own currency comes from `OrderData.currency` (§13), not from
`combine()`.

**`combine()` is commit-time only (A14-5).** It is a draft-assembly/commit
operation and is **never** run on a restoration path: a committed order persists
its own order-level `PriceRecord` and is read back structurally (§14.6). The
"eligible under current semantics" check therefore constrains *new* commitments
only; it can never make a stored, committed record unreadable.

#### 14.1 Pricing semantics identifiers (owner decision OD-9)

A `semanticsId` identifies the **complete frozen calculation pipeline** that
produced a record: modifier validation, in-order application, and rounding. It is
not merely a rounding-policy tag.

Normative rules:

- identifiers are **assigned exclusively by `@comity/pricing`**;
- identifiers are **monotonically increasing**;
- identifiers are **immutable**;
- identifiers are **never reused** — a retired identifier is not recycled;
- identifiers are **independent of npm package versions** — a version bump is not a
  semantics identifier;
- an identifier covers the whole pipeline, **including its historical validation
  rules**, not only its arithmetic. A modifier that a newer engine rejects was
  legal when it was committed and MUST still verify;
- historical verification MUST use the implementation associated with **the
  record's own identifier**;
- a retained implementation MUST NOT silently delegate to current semantics, and
  MUST NOT read the current currency table, current validation rules, the system
  clock, locale, floating-point arithmetic, or any external service.

#### 14.2 Verification contract

```ts
// ACCEPTED / IMPLEMENTED — PriceVerification (A14-1…A14-17).
type PriceVerification =
  | { readonly outcome: "verified"; }
  | { readonly outcome: "mismatch"; }
  | {
      readonly outcome: "unverifiable";
      readonly cause: "unknown_semantics" | "retired_semantics" | "unspecified";
    };
```

Verification MUST never:

- recalculate and replace the record's total;
- mutate the record;
- fall back to current semantics when the original semantics are unavailable;
- report `verified` merely because current arithmetic happens to produce the same
  amount. A match obtained under a **different** identifier is `unverifiable`, not
  `verified`.

`verified` means "faithful to the semantics that produced it". It does **not** mean
"acceptable to commit today" — that is a separate question, asked by the Order at
its commitment boundary against **current** semantics.

#### 14.3 Where the retained semantics live

Retained implementations are a **closed, frozen, module-private table inside
`@comity/pricing`**. There is no registration API, no plugin surface, no strategy
framework and no public extension point: a mutable registry would make verification
depend on ambient configuration and destroy determinism. Consumers see only
`PriceRecord.verify()` and `PriceVerification`.

This follows the existing pattern in this package, where a Value Object consults a
module-private frozen table (`Currency` over the ISO exponent table, `Price` over
the modifier-kind set).

#### 14.4 `historicalInputs()` contract (owner decision OD-10 — APPROVED)

The name `historicalInputs()` is **approved**, not provisional. Its contract is normative and consists of four prohibitions
and one positive statement; every consumer must be read against them:

1. **It exposes historical pricing inputs only.** The returned `subtotal` and ordered `modifiers` are the inputs that were
   committed with this record, and `semanticsId` is the identifier that produced its `total`. Nothing else is returned.
2. **It MUST NEVER be interpreted as a calculated total price.** The record's `total` is deliberately *not* returned and MUST
   NOT be substituted for the subtotal. Applying modifiers to a historical total double-applies them.
3. **It MUST NEVER be interpreted as a unit price.** `subtotal` is the committed amount for the **entire line** (or the whole
   order, at aggregate level). It MUST NOT be multiplied by `quantity`, which would double-count: quantity does not
   independently determine price (ADR-013; Order invariant O-7).
4. **It is NOT sufficient for commercial re-sourcing.** When the required application inputs — catalog, price-list, offering
   or discount data — are unavailable, these inputs cannot reconstruct them. `OrderLine` carries only opaque
   `offeringId`/`priceListId` references and never resolves them, so re-sourcing is the application's responsibility and
   needs the application's own inputs.
5. **Positively: it IS sufficient for arithmetic re-base** — re-applying *current* semantics to the *same* commercial inputs.
   That is its only intended use, and the sole reason the operation exists.

**No misleading calculation may be derived from it.** An operation that returns these inputs MUST NOT be presented as, or
implemented to produce, a current commercial offer; and no consumer may infer that a record's historical inputs constitute a
current price. An application that needs a current price must obtain current commercial inputs and compute one.

The rename is recorded here because the earlier proposal used a name that invited exactly the misreadings in (2) and (3): it
read as "a price input" rather than "the historical inputs". That rejected name is not carried anywhere in this
documentation; `historicalInputs()` is the only name, and it is approved.

#### 14.5 Record schema `format` vs calculation `semanticsId` (A14-3)

A `PriceRecord` carries **two independent version axes**:

- **`format`** — the schema/version of the *persisted record shape itself*. It tells a reader how to interpret the
  fields. An unsupported or higher `format` is a **structural failure** (`unsupported_record_format`, §9): the
  reader cannot safely interpret the record. A known `format` is read explicitly; the shape is never guessed.
- **`semanticsId`** — the *calculation pipeline* that produced `total` (validation, in-order application,
  rounding; §14.1). It is **not** the record schema and **not** the npm package version.

The two axes MUST NOT be conflated: a new field (schema evolution) changes `format`; a change to the arithmetic
changes `semanticsId`. Neither implies the other.

#### 14.6 Serialization, structural validation and restoration (A14-4, A14-6)

`PriceRecord` is serialized to a **plain, JSON-safe `PlainPriceRecord`** and restored **structurally**:

```ts
// ACCEPTED / IMPLEMENTED — lossless plain wire form.
interface PlainPriceRecord {
  readonly format: 1;
  readonly currency: { readonly code: string; readonly exponent: number };
  readonly subtotal: string;   // bigint integer minor units, decimal string
  readonly modifiers: ReadonlyArray<{
    readonly code: string; readonly label?: string; readonly kind: PriceModifierKind; readonly component?: string;
    readonly adjustment:
      | { readonly type: "money";      readonly amount: string; readonly operation: AdjustmentOperation }
      | { readonly type: "percentage"; readonly amount: string; readonly scale: number; readonly operation: AdjustmentOperation };
  }>;
  readonly total: string;      // bigint integer minor units, decimal string
  readonly semanticsId: number;
}
```

Normative rules:

- **Lossless wire form (A14-4).** Integer monetary values are written as **decimal strings** (never `number`,
  which is lossy above `2^53`); `Percentage` is written as `(amount, scale)`; `code`/`exponent`, ordered
  `modifiers`, `format` and `semanticsId` are preserved verbatim. `restore(toPlain(r))` MUST be lossless and
  idempotent.
- **Structural restoration only (A14-6).** `restore` validates the shape and ranges and **MUST NOT** call
  `Currency.create`, consult the current currency table, recompute `total`, or repair/clamp an amount. A malformed
  record is a **structural failure** (reasons in §9), never a silently coerced record.
- **Three distinct states.** *Structural validity* (does the record parse and satisfy ranges), *semantic
  verifiability* (`verify()` → `verified | mismatch | unverifiable`, §14.2), and *commit eligibility* (current
  semantics, enforced by `combine`/the order at commit) are separate questions. A structurally valid record with
  an unknown `semanticsId` is readable and merely `unverifiable`; a structurally invalid record is not a record.
- **No live dependency.** Restoration never needs a live price definition, the current currency table, or
  Commerce.

#### 14.7 Record equality, `combine` composition and commit eligibility (A14-12…A14-17)

**ACCEPTED / IMPLEMENTED.** The rules below are normative for `PriceRecord` and `combine`.

**A14-12 — Exact `PriceRecord` equality (commitment equality).** Two `PriceRecord`s are *commitment-equal* iff all of the
following are equal:

- `format`;
- `semanticsId`;
- `currency.code` and `currency.exponent`;
- `subtotal` and `total` (exact `bigint`);
- `modifiers`, element-wise **in their original order**, on every persisted field: `code`; `label` presence and value
  (absent ≠ present); `kind`; `component` presence and value; `adjustment.type`; `adjustment.operation`; and `amount`
  (money) or `amount` and `scale` (percentage).

The three relations are distinct and MUST NOT be conflated:

- **Arithmetic equivalence** — same currency, `subtotal` and `total`, regardless of how the result was composed.
- **Semantic equivalence** — the same ordered arithmetic operations (`type`, `operation`, `amount`/`rate`) under the same
  `semanticsId`, regardless of recorded provenance.
- **Historical/provenance equality** — every persisted field above, including `label`/`kind`/`component`, in order.

**Only historical/provenance equality is sufficient for Order commitment reconciliation.** Modifiers are **never
deduplicated**: duplicates are legitimate when they record distinct applications, and positional comparison is required.
Order is significant because sequential percentage operations and intermediate rounding can produce different results.
Percentage equality here is **structural** on `(amount, scale)`, not numeric (`Percentage.equals` is numeric and MUST NOT be
used for this comparison). Pricing owns this definition; a consumer (ADR-032 `Order`) MAY compare the persisted public
fields as a plain field comparison and MUST NOT reimplement Pricing arithmetic or modifier semantics. No `equals()`
operation is added to the public API by this amendment.

**A14-13 — `combine(parts, adjustments)` composition.** `parts` are finalized **line-level** `PriceRecord`s. Each part's
`total` is the amount that line contributes. Composition proceeds in exactly three steps, with no overlap:

1. **Line validation.** Each part is validated under **current** semantics using *its own* `subtotal` and *its recorded
   line modifiers* (A14-15). This step uses the line modifiers; it is the reason "line modifiers are not reapplied" must
   never be read as "line modifiers are not used to validate the line record".
2. **Aggregation.** `subtotal = Σ part.total`, an exact integer sum with no rounding. Line modifiers are provenance of the
   already-finalized line calculation: they are **never applied again** during aggregation and are **never copied** into
   the resulting aggregate modifier list.
3. **Order adjustment.** The supplied `adjustments` are order-level only. They are applied **exactly once**, in their
   supplied order, to the aggregate `subtotal`, under current semantics and the §8 rounding rule.

The resulting record's `modifiers` contain the order-level adjustments only. The resulting record receives the current
supported `format` and the current `semanticsId`.

**A14-14 — Accepted adjustment input.** `combine` accepts
`adjustments: ReadonlyArray<PriceModifier | PriceModifierRecord>`. Both forms are normalized to the same internal
representation and validated identically: a known `type` and `operation`; a non-negative integer `amount` (money) or a
non-negative integer `amount` and a non-negative integer `scale` (percentage); and `label`/`component` as strings when
present. A `PriceModifierRecord` MUST NOT bypass validation merely because it is already in record form. This amendment
adds no public verification API and does not broaden the `order → pricing` dependency (OD-8, ADR-008): `combine` remains
the only value-level operation Order may call.

**A14-15 — Part validation under current semantics.** Before aggregation, `combine` MUST validate every part:

- supported `format`;
- `semanticsId` equal to the **current** semantics identifier;
- a supported **currency representation**: a non-empty `code` and an integer `exponent >= 0` (representation only —
  `combine` MUST NOT consult the current ISO 4217 table);
- valid modifier records (A14-14);
- internally coherent arithmetic: `total` equal to the result of applying the part's recorded modifiers to the part's
  `subtotal` under **current** semantics and the §8 rounding rule.

`combine` MUST NOT consult the retained-semantics table. Records whose `semanticsId` is older or unknown are **not
eligible for a new commitment** through `combine`, even when they can be structurally restored or historically verified
elsewhere. This preserves the three distinct states: `restore()` remains **structural only** (A14-6) and MUST NOT perform
semantic verification; `verify()` remains **historical**, using the record's own identifier (§14.2); `combine` is the
**current commit-eligibility** boundary (§14.6).

**A14-16 — Failure and empty-input behavior.** `combine` fails deterministically, reusing the existing closed reason
inventory (§9); no new public error type is introduced:

| Failure | Reason |
| --- | --- |
| Currency `code` mismatch | `currency_mismatch` |
| Currency `exponent` mismatch | `currency_mismatch` |
| Unsupported record `format` | `unsupported_record_format` |
| Invalid or unsupported modifier | `invalid_modifier` |
| Unknown or non-current `semanticsId`, incoherent part, empty `parts` | `calculation_failed` |

`combine([], …)` is **rejected** with `calculation_failed`; an empty Order is handled explicitly by ADR-032 and MUST NOT be
represented by treating empty input as a valid combination. No integer-overflow behavior is defined: `bigint` arithmetic
does not overflow.

**A14-17 — Mathematical and operational properties.** Only the following are guaranteed:

- **Part-order independence:** aggregation sums exact integer `total`s, so the resulting `subtotal` does not depend on the
  order of `parts`. The order of `adjustments` remains significant.
- **Single-record flattening:** `combine([r], [])` preserves `r.total`, but the result is flattened — its `subtotal` equals
  `r.total` and its `modifiers` list is empty. Historical provenance is therefore not preserved by re-combination.
- **No general associativity:** grouping parts and applying adjustments at an intermediate level can change the base for
  later percentage operations and rounding, so `combine(combine(...), ...)` is not generally equivalent to one `combine`.
- **Conditional idempotence:** structural idempotence holds only after flattening; it MUST NOT be confused with
  historical/provenance equality (A14-12).

No stronger associativity, idempotence, commutativity or equivalence property is claimed.

**Worked example (exact integer minor units; EUR, exponent 2).**

- Line A: `subtotal = 1000`, one recorded line modifier `−10%`; validation under §8 gives
  `delta = roundHalfUp(1000 × 10, 10^2) = 100`, so `A.total = 900`.
- Line B: `subtotal = 2000`, one recorded line modifier `−500`; `B.total = 1500`.
- `combine([A, B], [+10%])`: `subtotal = 900 + 1500 = 2400`; the order adjustment is applied **once**:
  `delta = roundHalfUp(2400 × 10, 10^2) = 240`; `total = 2640`.

A's and B's line modifiers validate their finalized records (`total = apply(current, subtotal, modifiers)`) but are **not**
applied again during aggregation. The order-level `+10%` is applied once to `2400`, not to either line.

**Implemented and released (2026-11-06).** This section (§14, including §14.1–§14.7) is implemented and published in
`@comity/pricing@0.10.0`: `PriceCurrency`, `PriceRecord`, `PriceModifierRecord`, `PlainPriceRecord`,
`PriceVerification`, `currentPriceCurrency`, and the operations `PriceRecord.from`, `toPlain`, `restore`, `verify`
and `combine` (including the module-private retained-semantics table used by `verify`). The historical design
rationale above is retained; the prior pre-implementation note is superseded.

## Domain Model

```
packages/pricing/src/
  value-objects/
    currency.ts         Currency
    money.ts            Money
    percentage.ts       Percentage
    price.ts            Price
  contracts/
    price-modifier.ts    PriceModifier, PriceModifierKind, PriceAdjustment, AdjustmentOperation
    price-snapshot.ts    PriceSnapshot
    price-record.ts      PriceRecord, PriceCurrency, PriceModifierRecord, PlainPriceRecord, PriceVerification
  domain/
    calculate-price.ts   calculatePrice
    pricing-semantics.ts semanticsId assignment + module-private retained-semantics table (verify)
  errors/
    pricing.ts           PricingError, PricingErrorReason
    index.ts
  index.ts               public API
```

No `entities/`, no `repository/`, no generic numeric abstraction, no adapter
dependencies.

## Consequences

**Positive:**

- exact money math with integer minor units instead of floating-point `number`
- typed, validated currency that owns monetary precision (exponent)
- percent modifiers use a domain-specific `Percentage` instead of a generic
  decimal
- `PriceModifier` invalid states are impossible by construction (discriminated
  `PriceAdjustment` union with explicit operation)
- the sign is expressed as a mathematical `add` / `subtract` operation, never
  derived from `kind` — no hidden checkout policy in pricing
- `Price` invariants are protected by controlled creation (total computed
  internally)
- `@comity/order` can consume `Money`/`Price` (ADR-013 open question closed by
  `PriceSnapshot`)
- pricing becomes a real domain module with pure, testable calculation
- `*Model` naming debt in `@comity/pricing` is paid (ADR-012 §5 follow-up)

**Negative / Trade-offs:**

- breaking public API change (`PriceModel` → `Price`, `PriceModifierModel` →
  `PriceModifier`, `number` money → `Money` with integer minor units, throwing
  constructors → `static create(): Result`, `PriceProjection` →
  `PriceSnapshot`) — MAJOR bump
- fractional quantities (kg, meters, consumption) are NOT supported by `Money`
  by design; they must be owned by their domain module
- percentage rounding policy (half-up) and input-order application become a
  documented contract that downstream modules must respect
- `invalid_precision` is currently unreachable (reserved for future scaled
  operations)

**Added by the historical-record consolidation (owner decisions OD-6 and OD-9; §§13–14):**

- a committed amount survives a withdrawn currency code, a changed exponent and any
  future change of pricing arithmetic; historical truth stops depending on the live
  currency table or the installed calculation engine
- `Price` keeps its single validation boundary: it is never reconstructed from
  untrusted data, and no trusted-restoration bypass is introduced
- `Currency` is untouched, so current-currency validation stays strict for new
  calculations
- verification becomes honest: `unverifiable` is a first-class outcome instead of a
  silent recomputation
- **cost:** `@comity/pricing` now owns a persisted record shape and must retain
  frozen historical semantics. Retaining semantics is a permanent maintenance
  obligation — once an identifier is issued it can never be retired without making
  every record that carries it permanently `unverifiable`
- **cost (A14-3/A14-10):** `PriceRecord` also carries a schema `format` that must be maintained: every shape
  change mints a new `format`, readers must handle each known `format` explicitly, and an unsupported `format` is
  a structural failure. This is a second, independent maintenance axis from `semanticsId`.
- **cost:** `@comity/order` gains a runtime value-import edge on `order → pricing`. This is
  **owner-approved (OD-8)** and narrowly scoped to the public `PriceRecord`, `PriceCurrency`, and
  `PriceModifierRecord` record types and `combine`; it is **formally incorporated** into the ADR-008 register as a
  **Value** dependency (2026-11-06). The implementation has been completed and released in `@comity/pricing@0.10.0`
  and `@comity/order@0.10.0`. The approved scope excludes `verify()`, retained-semantics table access, and an
  aggregate-side `from`.
- **cost:** consumers must persist `PriceRecord` rather than `Price`, and must stop
  treating `PriceSnapshot` as a storage form (§7)

## Migration Plan

1. This ADR (status Proposed → Accepted after review)
2. Introduce `Currency` (with exponent), `Money` (integer minor units),
   `Percentage` Value Objects (+ tests)
3. Introduce `PriceModifier` (discriminated union) and `PriceSnapshot`
   contracts (+ tests)
4. Introduce `Price` Value Object with internal total computation (+ tests)
5. Introduce `PricingError` with the final reason union (+ tests)
6. Introduce `calculatePrice` (+ tests: fixed/percent, ordering, errors)
7. Migrate `@comity/order` to `Money`/`Price`/`PriceModifier`
8. Update docs (package overview.md, conventions.md, README), ADR-012
   follow-up list; build, test, typecheck, coverage
9. Introduce the historical record contract (§13–§14): `PriceCurrency`, `PriceRecord`, `PriceModifierRecord`,
   `PlainPriceRecord`, `PriceVerification`, internal `semanticsId` assignment, the record schema `format`, and the
   module-private retained-semantics table; add `from`/`combine`/`verify`/`toPlain`/`restore` (+ tests: lossless
   round-trip, `verified`/`mismatch`/`unverifiable`, structural failures, currency incoherence, commit-time-only
   `combine`).
10. Add the additive `unsupported_record_format` reason (§9) and the structural-record failure tests (A14-7).
11. Persist `PriceRecord` (never `Price`) through the `@comity/order` adapter: `code`+`exponent`, decimal-string
    amounts, ordered modifiers, `format`, `semanticsId`; restoration is structural only, never recomputed (A14-4).
12. Migrate `@comity/order` to `OrderLine.price: PriceRecord` / `OrderData.price: PriceRecord` /
    `OrderData.currency: PriceCurrency` (ADR-013/ADR-032 Amendment 1). This requires the OD-8 `order → pricing`
    value import to be formally incorporated in ADR-008 first — a separate owner step, not changed by this ADR.

## Open Questions

- **Modifier ordering** — modifiers are applied in **input order**; the engine
  never reorders them. This replaces the earlier fixed
  `discount → shipping → fee → tax → credit → other` policy and the interim
  explicit `priority` field. Pricing encodes no global application order; the
  consumer fully controls it. Revisit only if a real requirement forces an
  engine-owned policy.
- **Percentage semantics** — `operation: "add" | "subtract"` expresses the
  sign while keeping `Percentage` a real rate. A discount is `10%` +
  `subtract`, a fee is `10%` + `add`; the engine never derives the sign from
  `kind`.
- **Minor-unit scaling** — `invalid_precision` is reserved for future scaled
  operations (e.g. a fractional-quantity calculation needing a rounding
  policy). It is unreachable with the current API by design.
- **Fractional quantities** — kg, meters, consumption, time are owned by their
  domain modules. Pricing may add a dedicated calculation only when a real
  need emerges; it must not resurface a generic `Decimal`.
- **Coupon/promotion applicability** — coupon validation still belongs to
  application/domain services and `@comity/pricing` calculation consumers; this
  ADR does not define coupon rules.
- **Tax module** — `@comity/tax` is future work; when it exists it may consume
  pricing results (`tax → pricing`), never the reverse.
- **Currency conversion** — `USD → EUR` conversion is a pricing responsibility
  but NOT a `Money`/`Currency` responsibility. Future domain services in
  `@comity/pricing`: `ExchangeRate`, `ExchangeRateProvider`, `CurrencyConverter`.
  Not implemented now; architectural TODO, requires a dedicated ADR.
- **MoneyFormatter / CurrencyFormatter** — human / localized rendering
  (`10€`, `$20`) is a dedicated formatter, future work. `Money.toString()` and
  `Percentage.toString()` stay stable technical / canonical representations;
  `Intl`/locale handling never lives in the Value Objects.
- **Measurement module** — if a shared quantity semantics is needed across
  bounded contexts, extraction requires a new architectural decision in a
  dedicated module (e.g. `@comity/measurement`), not a pricing concern.
- ~~**`historicalInputs()` naming**~~ — **CLOSED by owner decision OD-10 (2026-11-05).** The identifier
  `historicalInputs()` is **approved**, not provisional, and its contract is normative in **§14.4**: it exposes
  historical pricing inputs only; it is never a calculated total price; it is never a unit price; and it is not
  sufficient for commercial re-sourcing. The rename was required precisely because the earlier proposed name
  invited the first two of those misreadings.
- ~~**Inactive-currency drafts**~~ — **CLOSED by owner decision OD-11 (2026-11-05).** A draft whose currency is
  inactive or unsupported is **abandoned and re-created**; it must not be repriced into another currency. Committed
  orders with withdrawn codes remain loadable and historically verifiable, and current currency eligibility remains a
  current-operation constraint rather than a reason to reject a record. Normative rule in **§13.1**.
- **First semantics identifier** — which identifier is issued first, and whether
  identifiers are dense (1, 2, 3 …) or drawn from a reserved range, is an
  implementation detail of `@comity/pricing`. OD-9 fixes only the invariants
  (exclusive assignment, monotonic, immutable, never reused, independent of package
  versions); it does not fix a starting value.

## References

- `docs/standards/decisions/ADR-012-standard-domain-modeling.md` — object
  taxonomy, error semantics, `*Model` follow-up
- `docs/standards/decisions/ADR-013-order-entity-consolidation.md` — `Money`/
  `Currency` ownership, deferred pricing-snapshot shape, order persistence and the
  historical price representation
- `docs/standards/decisions/ADR-032-order-aggregate-commerce-extension.md` — the
  `@comity/order` consumer of `PriceRecord` and `PriceCurrency` (OD-6, OD-7, OD-9)
- ADR-008 — Explicit Core Module Composition Exceptions (Community-specific register instance in comity-community)
  — `order → pricing` register. **"Amendment 1"** records the **owner-approved (OD-8)** narrow value-import
  exception, **formally incorporated (2026-11-06)**: the register classifies the edge as **Value** and the
  machine-readable register records `"importKind": "value"` with the `"value-import"` category
- `docs/standards/domain-modeling.md` — Value Objects, value structures; §3
  ("no `fromTrusted()`/`unsafeCreate()`/`hydrate()` bypass") is what §14 relies on
  to keep `Price` out of the persistence boundary
- `docs/standards/errors.md` — error model
- `packages/catalog` — error subpath pattern
- `packages/customer` — canonical Value Object implementation