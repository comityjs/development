# Repository Ownership Model

## Overview

This document establishes the canonical ownership boundaries between `comity-development`, `comity-community`, and `comity-enterprise`.

## Ownership Matrix

| Concern | Development | Community | Enterprise |
|---------|-------------|-----------|------------|
| Comity-wide standards | **Owner** | Consumer | Consumer |
| Comity-wide ADRs | **Owner** | Consumer | Consumer |
| Comity-wide contributor conventions | **Owner** | Consumer | Consumer |
| Comity-wide AI/agent conventions | **Owner** | Consumer | Consumer |
| Runtime implementation (`@comity/*`) | No | **Owner** | **Owner** |
| Community dependency graph | No | **Owner** | No |
| Enterprise dependency graph | No | No | **Owner** |
| Community CI/release | No | **Owner** | No |
| Enterprise CI/release | No | No | **Owner** |
| Shared development tooling | **Future owner** | Current transitional owner | Consumer |
| Community-specific documentation | No | **Owner** | No |
| Enterprise-specific documentation | No | No | **Owner** |
| Migration/conformance state | No | **Owner** | No |

## Key Principles

### 1. Development Owns Comity-Wide Contracts

`comity-development` is the **single canonical owner** of:
- Framework layering policy
- Module architecture rules
- Adapter contracts
- Coding/testing/documentation standards
- Architectural Decision Records (ADRs) that affect the framework
- Contributor and AI agent operating models

Community and Enterprise **consume** these contracts. They do not own them.

### 2. Community and Enterprise Are Siblings

```
comity-development (owns contracts)
        ▲
        │
   ┌────┴────┐
   │         │
Community  Enterprise
(impl)     (impl, future)
```

- Neither Community nor Enterprise owns the other
- No dependency: `comity-enterprise → comity-community` or vice versa
- Both depend on `comity-development` for governance

### 3. "Current Transitional Owner" for Shared Tooling

Community currently contains shared development tooling (architecture validator, scripts, etc.). This is **transitional**.

- Phase 3: Tooling remains in Community
- Phase 5+: Tooling extracts to `comity-development` (or `@comity-dev/*` packages)
- Until extraction, Community is the "current transitional owner"
- Development is the "future owner"

### 4. Runtime Namespace Is `@comity/*`

The package namespace `@comity/*` is for **first-party runtime packages** regardless of repository ownership.

- `comity-development` does **not** imply a runtime package namespace
- Future development tooling may use `@comity-dev/*` (Phase 5+ concern)
- Enterprise packages remain `@comity/*` (not `@comity-enterprise/*`)

## Ownership Transitions

### Phase 3 (Current) — Establish Boundary

- Development repository created
- Ownership model documented
- No material migrated yet (Phase 4 owns standards extraction)
- No tooling extracted (Phase 5 owns tooling extraction)

### Phase 4 — Standards Extraction

- Migrate standards from `comity-community/docs/standards/` → `comity-development/docs/standards/`
- Migrate Comity-wide ADRs from `comity-community/docs/standards/decisions/` → `comity-development/docs/standards/decisions/`
- Preserve historical provenance

### Phase 5 — Tooling Extraction

- Extract architecture validator, CLI, shared scripts
- Publish as `@comity-dev/*` packages (if warranted)
- Community becomes pure consumer

### Phase 6 — Enterprise Creation

- Create `comity-enterprise` repository
- Enterprise consumes Development contracts
- Enterprise owns its runtime implementation and CI/release

## Provenance Requirements

Any material moved between repositories MUST retain:

- Original repository
- Original path
- Original filename
- Original ADR/standard identity
- Migration phase
- Canonical vs. transitional status

Do not rewrite history to make the new repository appear older than it is.

## Decision Authority

| Decision Type | Authority |
|---------------|-----------|
| Framework architecture | Development (ADR process) |
| Community implementation | Community maintainers |
| Enterprise implementation | Enterprise maintainers (future) |
| Cross-repository standards | Development (with consumer input) |
| Repository-specific process | Respective repository |

## Dispute Resolution

When consumers (Community/Enterprise) disagree with a Development-owned standard:

1. Open issue in `comity-development`
2. Discuss with all stakeholders
3. If consensus fails, Development maintains authority as contract owner
4. Consumers may request exception via ADR process
5. Exceptions are documented, not silent deviations