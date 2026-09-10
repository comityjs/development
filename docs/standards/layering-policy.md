# Comity Coding Standards — Official Layering Policy

> **Provenance:**
> - Originally: `comity-community/docs/standards/layering-policy.md`
> - Migrated to: `comity-development/docs/standards/layering-policy.md`
> - Migration: Phase 4
> - Original semantic owner: Comity-wide
> - Canonical owner: comity-development

This document formalizes the **official layering model** of Comity.

Layering is not optional. It is a structural constraint that guarantees:

- Long-term maintainability
- Transport independence
- Observability extensibility
- Enterprise scalability
- Minimal cognitive load

Violating layering rules is considered an architectural defect.

---

# 1. Architectural Overview

Comity is built on a strict separation of concerns across five conceptual layers:

```
1. Kernel
2. Core Modules
3. Adapters
4. Extensions (Cross-Cutting Policies)
5. Application Layer
```

Each layer has explicit responsibilities and dependency rules.

---

# 2. Layer Definitions

## 2.1 Kernel

**Purpose:**
Provide minimal, transport-agnostic primitives.

Examples:

- Result
- BaseError
- DI container
- Lifecycle primitives

The Kernel:

- MUST NOT depend on HTTP, SQL, Auth, HTML, or any infrastructure
- MUST remain environment-agnostic (Node, Edge, Browser)
- MUST not implement policy
- MUST not implement business logic

The Kernel is foundational and intentionally minimal.

---

## 2.2 Core Modules (`@comity/*`)

**Purpose:**
Provide domain-neutral infrastructure abstractions.

Examples:

- `@comity/http`
- `@comity/sql`
- `@comity/auth`
- `@comity/html`

Core Modules:

- MAY depend on Kernel
- MUST NOT depend on other Core Modules unless explicitly allowed
- MUST NOT depend on specific frameworks
- MUST remain implementation-agnostic

Core Modules define contracts — not concrete infrastructure.

Core-to-Core dependencies are forbidden by default. Approved exceptions are maintained exclusively in ADR-008. This policy does not duplicate the register.

---

## 2.3 Adapters

**Purpose:**
Bind Core Modules to concrete technologies and integrate external platforms.

Adapters come in two distinct categories:

### Technology Adapters

**Purpose:**
Bind ONE Core Module to one interchangeable technology.

Examples:

- `@comity/http-hono`
- `@comity/sql-kysely`
- `@comity/graphql-client-ws`
- `@comity/html-react`

Technology Adapters:

- implement/bind exactly **one** Core Module
- represent an interchangeable technology
- MAY depend on the Core Module they implement
- MAY depend on third-party libraries
- MUST NOT introduce business logic
- MUST normalize external errors into module errors

The rule **"one adapter = one Core Module"** applies to Technology Adapters.

A Technology Adapter MAY consume technology-agnostic composition infrastructure
(e.g. a canonical facade, factory, or wiring helper) from another Core Module
without thereby becoming an adapter for that Core Module. The one-Core-Module
rule governs which Core Module contract the adapter _implements_, not every
package it consumes during composition. Such infrastructure consumption does not
create a second implemented contract and does not weaken the rule.

### Integration Adapters

**Purpose:**
Integrate a single external platform/system with one or more Core Module contracts.

Integration Adapters:

- integrate a **single** external platform/system;
- MAY implement contracts belonging to **multiple** Core Modules (the "one adapter = one Core Module" rule does NOT apply to them);
- keep shared platform-specific schema, mapping, normalization, and logic inside the package;
- have a unified configuration surface and lifecycle;
- are replaceable as a platform in its entirety;
- MAY depend on the Core Modules whose contracts they implement and on the Technology Adapters that provide the underlying technology;
- MUST NOT depend on Application-layer code;
- MUST NOT depend on other Integration Adapters;
- MUST NOT become a masked Application Layer (no business orchestration, no application logic).

An Integration Adapter MUST satisfy the qualifying criteria defined in `ADR-007` (single named platform, shared platform-specific schema/mapping/normalization, unified configuration surface, replaceable as a whole). If it does not, it MUST be modeled as one or more Technology Adapters.

### GraphQL Terminology

GraphQL spans both adapter categories; the classification depends on what the package binds:

- `@comity/graphql-client` is a **Core Module**. It defines the GraphQL contracts and the `GraphqlClient` facade/abstraction, which is transport-independent.
- The concrete transport (fetch, WebSocket, ...) is provided by **Technology Adapters**, e.g. `@comity/graphql-client-ws` (WebSocket) and a fetch-based adapter (`@comity/graphql-client-fetch`) where fetch is the underlying technology.
- An Integration Adapter may use the GraphQL client and its transport adapters to integrate an external platform without becoming a Technology Adapter itself.

```text
Integration Adapter
    storefront platform integration
            │
            ├── @comity/storefront
            ├── @comity/catalog
            ├── @comity/router
            ├── @comity/cache
            └── @comity/graphql-client
                         │
                         ▼
                Technology Adapter
                (fetch / WebSocket / ...)
```

The external platform is the system being integrated; GraphQL is the protocol/API used to integrate it.

Adapters are replaceable implementation details.

---

## 2.4 Extensions (Cross-Cutting Policies)

**Purpose:**
Provide optional enterprise-grade policies and operational concerns.

Examples:

- Rate limiting
- Circuit breakers
- Retry strategies
- Request tracing
- Instrumentation hooks
- Timeout policies

Extensions:

- MAY depend on Core Modules
- MUST remain optional
- MUST NOT be required by Kernel
- MUST compose via wrappers or middleware

Extensions implement policy — not abstraction.

---

## 2.5 Application Layer

**Purpose:**
Define business logic and composition.

Examples:

- Use cases
- Presenters
- Controllers
- Route definitions
- Policy wiring

The Application Layer:

- May depend on everything below
- Defines orchestration
- Owns configuration
- Registers middleware and extensions

The Application Layer is where enterprise behavior emerges.

---

# 3. Dependency Rules

The dependency graph MUST follow this direction:

```
Application
    ↓
Extensions
    ↓
Adapters
    ↓
Core Modules
    ↓
Kernel
```

Reverse dependencies are forbidden.

Forbidden examples:

- Kernel importing HTTP
- Core module importing Adapter
- Adapter importing Application logic
- Extensions modifying Kernel behavior

---

# 4. Where Enterprise Concerns Live

The following table defines official placement:

| Concern                | Layer                |
| ---------------------- | -------------------- |
| Rate limiting          | Extensions           |
| Circuit breaker        | Extensions / Adapter |
| Distributed tracing    | Extensions           |
| Request validation     | Application / HTTP   |
| Content negotiation    | HTTP module          |
| CORS                   | Framework middleware |
| Compression            | Framework / Proxy    |
| Route-specific timeout | Extensions / HTTP    |

Core principle:

> Kernel provides mechanisms, not policies.

---

# 5. Observability Policy

Observability MUST NOT be embedded in the Kernel.

Modules MAY expose lifecycle or instrumentation hooks.

Instrumentation MUST be opt-in and composable.

Tracing, metrics, and logging are integration concerns — not core semantics.

---

# 6. Replacement Principle

Every Adapter MUST be replaceable without modifying:

- Core Modules
- Kernel
- Business logic

If replacing a database or HTTP framework requires changing business logic, layering has been violated.

---

# 7. Determinism Policy (Core Modules)

Core Modules and Kernel packages MUST be deterministic. Non-deterministic behavior breaks the Comity reproducibility contract and makes testing, debugging, and auditing unreliable.

## 7.1 Forbidden in Core/Kernel

The following are **forbidden** in Core Modules and Kernel packages when used to drive domain decisions:

- `Math.random()` — never permitted in Core/Kernel; randomness MUST NOT drive business decisions
- randomness used for business decisions (ordering, pricing, eligibility, control flow)
- time/randomness used to drive domain decisions
- direct Node-specific runtime facilities:
  - `node:crypto`
  - `Buffer`
  - `process.env`
  - `fs`
- direct environment/global runtime dependencies in Core/Kernel

Randomness affecting ordering, pricing, eligibility, or control flow is forbidden.

## 7.2 Allowed

The following are explicitly **allowed** as operational metadata, not domain decisions:

- entity timestamps (e.g. `createdAt`/`updatedAt` via `Instant.now()`)
- TTL expiration (e.g. in-memory cache expiry checks)
- telemetry durations (e.g. facade/renderer duration measurements)
- boundary-generated IDs (e.g. adapter-owned request IDs minted at the HTTP boundary)
- request IDs
- newly minted child-entity IDs such as `order.addItem()` UUIDs

`order.addItem()` mints a child-entity ID via `crypto.randomUUID()` (`packages/order/src/entities/order.ts`). This behavior is intentionally retained. It is documented here as a permitted boundary-ID exception: the UUID identifies the newly created item and MUST NOT influence business decisions (quantity validation, pricing, ordering, or eligibility remain deterministic).

`http-hono` mints request IDs via `crypto.randomUUID()` at the adapter-owned HTTP boundary (`packages/http-hono/src/internal/context.ts`). Boundary/adapter-owned ID generation is allowed.

## 7.3 Permitted Telemetry Exceptions

The following exceptions are explicitly permitted for **observational/telemetry purposes only**:

| Exception | Allowed Packages | Purpose |
|-----------|-----------------|---------|
| `Date.now()` | `@comity/primitives` (time/instant), `@comity/http` (facade), `@comity/html` (renderer pipeline), `@comity/hydration` (browser/noop capability `now()`), `@comity/cache` (TTL expiry), `@comity/cli` (command duration telemetry) | Timestamp generation for logging/metadata; TTL and duration telemetry |
| `performance.now()` | `@comity/primitives` (time/instant), `@comity/http` (facade), `@comity/html` (renderer pipeline) | High-resolution timing measurements |
| `Instant.now()` | `@comity/primitives` | Canonical time abstraction (implementation uses `performance.now()` or `Date.now()`) |

**Rules for exceptions:**

1. **Observational only** — These APIs MUST ONLY be used for telemetry, logging, metrics, and duration measurements. They MUST NOT be used for domain logic, business decisions, or control flow.

2. **No domain coupling** — The result of `Date.now()` or `performance.now()` MUST NOT be stored in domain entities, used in domain calculations, or exposed in domain contracts.

3. **Explicit allowlist** — Only the packages listed above are permitted. Adding a new package to the allowlist requires architectural review and an update to this policy.

4. **No `Math.random()` exceptions** — There are no exceptions for `Math.random()` in Core/Kernel. Randomness MUST be injected via primitives or adapters.

## 7.3 Enforcement

The `@comity-dev/no-date-in-core` and `@comity-dev/no-crypto-in-core` ESLint rules enforce this policy. They are scoped to Core/Kernel packages via package classification and respect the allowlist above.

---

# 8. Minimal Surface Principle

Each layer MUST expose only what is necessary.

- Do not leak internal types
- Do not re-export adapter internals
- Do not collapse layers for convenience

Layer boundaries are architectural contracts.

---

# 9. Dependency Graph Rules (Consolidated from dependency-graph-policy.md)

Comity follows a strict layered architecture.

### Layers

1. primitives
2. kernel
3. transport (http, etc.)
4. infrastructure adapters (sql-kysely, http-hono, etc.)
5. rendering (html, hydration)

### Allowed dependencies

- primitives → (no internal deps)
- kernel → primitives
- http → primitives, kernel
- sql → primitives
- adapters → corresponding contract module + primitives
- rendering modules → primitives

### Core-to-Core dependencies (closed register)

- Core Modules MUST NOT depend on other Core Modules unless explicitly registered as an approved exception.
- The exhaustive exception register is maintained in ADR-008.
- Any Core-to-Core dependency not registered in ADR-008 is an architectural violation.

### Forbidden

- contracts must never depend on adapters
- primitives must never depend on any other internal package
- no cross-adapter dependencies
- rendering modules must never depend on HTTP runtime implementations or transport behavior

### Rendering modules and HTTP contract types

Rendering Core Modules MUST NOT depend on HTTP runtime implementations or transport behavior.

Rendering Core Modules MUST NOT reference HTTP contract types (`HttpResponse`, `HttpStatus`, `HttpRequest`, or any other HTTP contract). Rendered output is expressed through rendering-only contracts (e.g., `HtmlOutput`); HTTP response construction belongs to the application/HTTP boundary.

---

# 10. Design Intent

Comity is designed to be:

- Enterprise-grade in structure
- Minimal in abstraction
- Explicit in boundaries
- Replaceable in infrastructure
- Observable without coupling

The layering policy is what prevents Comity from becoming a framework monolith.
