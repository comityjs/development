# ADR-027 — GraphQL Architecture

> **Provenance:**
> - Canonical owner: comity-development
> - Ratified: Phase 16B — GraphQL Architecture Ratification: Final Decision Record

**Status:** Accepted

## Context

Phase 15 completed the search contract isolation. The GraphQL client capability (`@comity/graphql-client`, `@comity/graphql-builder`), technology adapters (`@comity/graphql-client-fetch`, `@comity/graphql-client-ws`), and Magento integration packages (`@comity/graphql-client-magento`, `@comity/catalog-magento`, `@comity/content-magento`, `@comity/storefront-magento`) required architectural clarification to establish clear ownership boundaries and eliminate redundancy.

Phase 16B ratified the final architectural decisions for the GraphQL layer. This ADR documents those decisions as the normative reference for implementation.

## Decision

### 1. GraphQL Client as Core Capability

`@comity/graphql-client` and `@comity/graphql-builder` are Core Modules.

They own:
- GraphQL request/response contracts (`GraphqlRequest`, `GraphqlResponse`)
- GraphQL transport abstraction (`GraphqlTransport`)
- GraphQL errors
- Client semantics and lifecycle
- Client registry (`GraphqlRegistry`)
- Setup/lifecycle via `@comity/graphql-client/setup`
- Capability token: `GRAPHQL_CLIENT_TOKEN = Symbol.for("@comity/graphql-client")`
- Query construction via `@comity/graphql-builder`

They MUST NOT own:
- Magento behavior, credentials, or store scope
- Magento query documents or schema knowledge
- HTTP or WebSocket transport implementations
- Platform-specific repositories

### 2. Fetch and WebSocket as Technology Adapters

`@comity/graphql-client-fetch` and `@comity/graphql-client-ws` are Technology Adapters.

They own:
- Concrete transport execution
- Serialization/deserialization
- Network/protocol handling
- Transport error normalization
- Transport response metadata (`meta.headers`, `meta.httpStatus`)

They MUST NOT contain:
- Magento logic
- Catalog/content/storefront logic
- Business logic
- Platform-specific repositories

Each depends on exactly one Core Module (`@comity/graphql-client`) plus its technology library.

### 3. Single Magento Integration Adapter

There is exactly one architectural owner for Magento integration: `@comity/storefront-magento`.

It owns:
- Magento endpoint configuration
- GraphQL client configuration
- Store-scope handling
- Magento GraphQL queries/fragments
- Magento schema knowledge
- Response mappers
- Magento error normalization
- Repositories implementing Core contracts (`ProductRepository`, `CategoryRepository`, `PageRepository`, `BlockRepository`, `RouteRepository`)
- Route resolution
- URL rewriting
- HTTP middleware integration
- Unified setup/lifecycle

It MUST NOT implement generic GraphQL transport behavior.

It MUST consume the Core GraphQL capability via `GRAPHQL_CLIENT_TOKEN` rather than replacing it.

### 4. Removal of `@comity/graphql-client-magento`

The package `@comity/graphql-client-magento` is removed entirely.

It was a redundant client-registration wrapper providing:
- A string token `GRAPHQL_CLIENT_MAGENTO_TOKEN = "@comity/graphql-client-magento"`
- A thin setup module registering a `GraphqlClient` instance

No replacement Magento-specific GraphQL client package is created. The Integration Adapter uses the Core capability token directly.

### 5. Consolidation of Magento POC Packages

| Package | Action |
|---------|--------|
| `@comity/catalog-magento` | Consolidated into `@comity/storefront-magento` |
| `@comity/content-magento` | Consolidated into `@comity/storefront-magento` |
| `@comity/graphql-client-magento` | Removed |
| `@comity/storefront-magento` | Kept as single Magento Integration Adapter carrier |

The resulting architecture has one Magento Integration Adapter. No second Magento Integration Adapter is created.

### 6. `GraphqlRequest.headers` — KEEP

`GraphqlRequest.headers?: Record<string, string>` is retained as generic per-request transport metadata.

Examples include:
- Store scope
- Authentication
- Tracing
- Other outbound request metadata

The Core contract remains generic.

### 7. `GraphqlResponse.meta` — KEEP

`GraphqlResponse.meta` is retained with the following boundary:
- `meta.extensions` → GraphQL-semantic metadata
- `meta.headers` → Transport-provided response metadata
- `meta.httpStatus` → Transport-provided response metadata

Consumers MUST NOT make transport metadata contractually mandatory.

No observability implementation is part of this phase.

### 8. `GraphqlRegistry` — DEFERRED

The following are NOT introduced:
- Root export
- `/registry` public subpath
- New registry API
- Consumer-facing registry abstraction

The existing registry remains internal. Future public exposure is follow-up work only.

### 9. DI / Token Rules

**Capability token:** Kept as `GRAPHQL_CLIENT_TOKEN = Symbol.for("@comity/graphql-client")`.

**Integration-specific client tokens:** NOT created. The string-token pattern (`"@comity/graphql-client-magento"`) is removed.

**Ownership:** Capability service tokens are owned by the capability package. Platform-specific wiring remains internal to the Integration Adapter.

A broader DI standard is follow-up work.

### 10. Core / Technology Adapter / Integration Adapter Boundaries

```
Core Modules
    ↓
Technology Adapters
    ↓
Integration Adapter
```

Dependencies flow downward only. No reverse dependencies exist.

**Invariant 1:** Core contains no Magento knowledge.

**Invariant 2:** Technology Adapters contain no Magento knowledge.

**Invariant 3:** There is one architectural Magento Integration Adapter.

**Invariant 4:** There is no independent `@comity/graphql-client-magento`.

**Invariant 5:** There is no Magento-specific published GraphQL client token.

**Invariant 6:** The capability token remains `Symbol.for("@comity/graphql-client")`.

**Invariant 7:** `GraphqlRequest.headers` remains intact.

**Invariant 8:** `GraphqlResponse.meta` remains intact.

**Invariant 9:** `GraphqlRegistry` remains non-public.

**Invariant 10:** All surviving Magento runtime packages declare correct `comity.layer` metadata (`integration-adapter`).

**Invariant 11:** Magento-specific GraphQL queries, schemas, mappers, repositories, and platform behavior are owned by the Integration Adapter.

### 11. Catalog/Category Responsibility Alignment

Per post-Phase-15 contracts (ADR-011):
- Catalog is product-oriented (`@comity/catalog` → `ProductRepository`)
- Categories belong to `@comity/taxonomy` (`CategoryRepository`)

Magento integration code MUST remove stale Category imports/references from catalog integration code. Category repositories are registered via `CATEGORY_REPOSITORY_TOKEN` from `@comity/catalog/setup` but the contract originates from taxonomy alignment.

### 12. Content Integration Alignment

Magento content integration MUST align with actual current `@comity/content` exports and contracts.

References to non-existent exports (previously identified: `ContentError`, `MenuRepository`, `RouteRepository`, `RouteModel`) are removed unless the current tree proves those exports now exist.

### 13. Error Subpath

Use the actual existing error subpath: `./errors` (e.g., `@comity/catalog/errors`, `@comity/content/errors`), not the stale `@comity/composition/error`.

### 14. Dead Dependency Removal

Remove `typed-magento-graphql` where confirmed dead after consolidation. Do not replace with an equivalent speculative dependency.

### 15. Package Metadata Compliance

All remaining `@comity/*` Magento packages MUST comply with ADR-026.

The surviving Magento Integration Adapter (`@comity/storefront-magento`) MUST declare:

```json
"comity": {
  "layer": "integration-adapter"
}
```

and all other schema-required metadata.

### 16. Semver Impact

- `@comity/graphql-client-ws`: patch (dependency removal only)
- `@comity/graphql-client-magento`: major (package removal)
- `@comity/catalog-magento`: major (package consolidation)
- `@comity/content-magento`: major (package consolidation)
- `@comity/storefront-magento`: minor (absorbs consolidated functionality)

### 17. Phase 16 Scope

Phase 16 is a targeted GraphQL architecture implementation. It is NOT a generic Enterprise cleanup.

**Explicitly included:**
- New normative ADR (this document)
- `@comity/graphql-client-ws` dependency hygiene
- Community patch Changeset for `graphql-client-ws`
- Removal of `@comity/graphql-client-magento`
- Consolidation of `@comity/catalog-magento` and `@comity/content-magento` into `@comity/storefront-magento`
- Re-alignment with post-Phase-15 Community contracts
- Unified Magento GraphQL wiring via Core capability token
- Correct `comity.layer` metadata
- Test coverage for consolidated behavior
- `comity-validate` gate

**Explicitly excluded (follow-up work):**
- GraphQL API redesign (`GraphqlRequest`, `GraphqlResponse`, `GraphqlTransport`)
- Registry API exposure (`GraphqlRegistry`, `DefaultGraphqlRegistry`)
- Comity-wide DI Token Standard
- Observability (tracing, metrics, logging, instrumentation)
- Caching standardization (`CachedCatalogRepositoryContext`)
- Naming churn (`@comity/graphql` rename)
- Generic cleanup (unrelated lint, dependencies, exports, documentation, package structure, naming, formatting)
- Core → Magento Semgrep rule
- DI token enforcement standard
- Automated single-Magento-Integration-Adapter register
- Enterprise register/CI
- Broader DI conventions

## References

- ADR-003 — HTTP Client Extraction
- ADR-007 — Multi-Context Adapter Architecture
- ADR-008 — Explicit Core Module Composition Exceptions
- ADR-011 — Catalog Product Definition Only
- ADR-026 — Architecture Validator Authoritative Package Classification
- Phase 16B — GraphQL Architecture Ratification: Final Decision Record
- Layering Policy (AGENTS.md)

## Consequences

**Positive:**
- Clear architectural boundaries between Core, Technology Adapters, and Integration Adapter
- Single Magento integration point eliminates redundant GraphQL client instances
- Core GraphQL capability remains platform-agnostic
- Technology Adapters remain replaceable
- Dependency direction enforced by validator

**Negative / Trade-offs:**
- Magento-specific code consolidated into one package (larger package)
- Removed `@comity/graphql-client-magento` token breaks any external consumers (none expected in Enterprise)
- Category repository token sourced from `@comity/catalog/setup` but contract aligned with taxonomy

## Scope

This ADR governs:
- GraphQL Core Module contracts and ownership
- Technology Adapter classification and constraints
- Magento Integration Adapter as single platform integration
- Package consolidation and removal
- DI token conventions for GraphQL capability
- Metadata boundary preservation
- Registry deferral
- Package metadata compliance
- Semver impact
- Phase 16 scope boundaries

This ADR does NOT govern:
- Future GraphQL API evolution
- Registry public exposure
- DI standard
- Observability implementation
- Caching standardization
- Broader architectural cleanups