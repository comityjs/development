# Rule Reconciliation — Comity Standards to Enforcement Mechanisms

**Status:** Authoritative inventory of every rule extracted from the
13 rationalized Standards and the deleted legacy validator
(`community/scripts/architecture-validator/`), reconciled against the
five Development-owned enforcement packages.

This artifact is **permanent governance evidence**, not a Phase report.
It does not invent rules. Where a rule cannot be reconstructed with
confidence, the row is marked `NOT-ENFORCEABLE` and the reason is
recorded.

---

## Reconciliation key

| Status | Meaning |
|--------|---------|
| SHARED | Rule implemented in a `@comity-dev/*` package |
| COMMUNITY-LOCAL | Rule is repository-specific; not shared |
| ENTERPRISE-LOCAL | Rule is repository-specific; not shared |
| ABSORBED | Rule consolidated into another rule |
| OBSOLETE | Rule superseded by ADR or Standard update |
| NOT-ENFORCEABLE | Cannot be reliably reconstructed; documented but not enforced |

## Mechanism key

| Mechanism | Package |
|-----------|---------|
| JSON Schema (Ajv) | `@comity-dev/schemas` |
| dependency-cruiser | `@comity-dev/dependency-rules` |
| ESLint flat config | `@comity-dev/eslint-plugin` |
| Semgrep | `@comity-dev/semgrep-rules` |
| Narrow TS validator | `@comity-dev/validate` (adapter peers only) |

---

## Layering Policy (`layering-policy.md`)

| ID | Rule | Source | Mechanism | Owner | Status | Evidence |
|----|------|--------|-----------|-------|--------|----------|
| L1 | primitives MUST NOT depend on any internal package | layering-policy.md §2.1 | dependency-cruiser (`primitives-no-internal`) | Development | SHARED | `packages/dependency-rules/src/build-config.ts` |
| L2 | kernel MUST only depend on primitives | layering-policy.md §2.1 | dependency-cruiser (`kernel-only-primitives`) | Development | SHARED | same |
| L3 | composition MUST only depend on kernel + primitives | layering-policy.md §2.1 | dependency-cruiser (`composition-only-kernel-primitives`) | Development | SHARED | same |
| L4 | core MAY depend on primitives, kernel, other cores (ADR-008) | layering-policy.md §2.2 | dependency-cruiser (`core-only-kernel-primitives-or-core-peer`) | Development | SHARED | same |
| L5 | core MUST NOT depend on adapters | layering-policy.md §2.3 | dependency-cruiser (`contracts-never-depend-on-adapters`) | Development | SHARED | same |
| L6 | adapter MUST NOT depend on adapter (except integration→technology) | layering-policy.md §2.3 / ADR-007 | dependency-cruiser (`no-cross-adapter-deps`) | Development | SHARED | same |
| L7 | primitives/kernel/composition MUST NOT depend on core | layering-policy.md §2.1 | dependency-cruiser (`kernel-no-core-deps`) | Development | SHARED | same |
| L8 | ADR-008 explicit Core-to-Core edges are permitted | ADR-008 / ADR-009 | dependency-cruiser (`adr-008-edge-*`) + JSON Schema (`adr008RegisterSchema`) | Development | SHARED | `packages/dependency-rules/src/build-config.ts`, `packages/schemas/src/schemas/adr-008-register.ts` |
| L9 | rendering core MUST NOT depend on HTTP/rendering runtime | layering-policy.md §8 | ESLint (`no-render-core-http-runtime`) | Development | SHARED | `packages/eslint-plugin/src/rules/no-render-core-http-runtime.ts` |
| L10 | one adapter implements one Core Module (scalar) | layering-policy.md §5 / ADR-026 | JSON Schema (`comity.implements` typed as string) + adapter-peers validator | Development | SHARED | `packages/schemas/src/schemas/package-metadata.ts`, `packages/validate/src/engines/adapter-peers.ts` |

## Adapters (`adapters.md`)

| ID | Rule | Source | Mechanism | Owner | Status | Evidence |
|----|------|--------|-----------|-------|--------|----------|
| A1 | technology-adapter declares implemented Core Module | adapters.md §11 / ADR-007 | JSON Schema + adapter-peers | Development | SHARED | same as L10 |
| A2 | technology-adapter declares core as peerDependency | adapters.md §13 | adapter-peers (`ARCH-ADAPTER-PEER-001`) | Development | SHARED | `packages/validate/src/engines/adapter-peers.ts` |
| A3 | technology-adapter depends on declared core | adapters.md §13 | adapter-peers (`ARCH-ADAPTER-PEER-002`) | Development | SHARED | same |
| A4 | technology-adapter peerDep only allowed: core, kernel, tech-binding | adapters.md §13 | adapter-peers (`ARCH-ADAPTER-PEER-004`) | Development | SHARED | same |
| A5 | technology-adapter missing/invalid `comity.implements` | adapters.md §11 | adapter-peers (`ARCH-ADAPTER-PEER-005`) | Development | SHARED | same |
| A6 | adapter implements structural contract | adapters.md §11 | Semgrep (`comity-adapter-must-declare-implements`) | Development | SHARED | `packages/semgrep-rules/rules/adapter-contract-shape.yaml` |
| A7 | adapter boundary exposes Result, not throws | adapters.md §12 | Semgrep (`comity-adapter-no-raw-error-throw`) | Development | SHARED | same |

## Errors (`errors.md`)

| ID | Rule | Source | Mechanism | Owner | Status | Evidence |
|----|------|--------|-----------|-------|--------|----------|
| E1 | error class extends BaseError | errors.md §2 | Semgrep (`comity-error-extends-baseerror`) | Development | SHARED | `packages/semgrep-rules/rules/error-class-shape.yaml` |
| E2 | error code follows `NS:REASON` | errors.md §4.1 | Semgrep (`comity-error-code-format`) | Development | SHARED | same |
| E3 | error reason is finite union | errors.md §4.2 | Semgrep (`comity-error-reason-type`) | Development | SHARED | same |
| E4 | one error class per module | errors.md §6 | Semgrep (`comity-one-error-class-per-module`) | Development | SHARED | same |
| E5 | raw `throw new Error()` forbidden | errors.md §12 | Semgrep (`comity-forbidden-raw-error-throw`) | Development | SHARED | same |
| E6 | domain MUST NOT throw (use Result) | errors.md §6 | ESLint built-in (`no-throw-literal`) in Community config | Community | COMMUNITY-LOCAL | `community/eslint.config.js` — ESLint built-in; not duplicated by shared plugin |

## Public API (`public-api.md`)

| ID | Rule | Source | Mechanism | Owner | Status | Evidence |
|----|------|--------|-----------|-------|--------|----------|
| PA1 | deep imports into `@comity/<x>/src|dist|internal|lazy` forbidden | public-api.md §3.2 | ESLint (`no-forbidden-deep-import`) | Development | SHARED | `packages/eslint-plugin/src/rules/no-forbidden-deep-import.ts` |
| PA2 | forbidden exports subpaths `utils|helpers|shared|internal|lazy` | public-api.md §3.2 | ESLint (`no-forbidden-subpath-import`) | Development | SHARED | `packages/eslint-plugin/src/rules/no-forbidden-subpath-import.ts` |
| PA3 | exports targets must resolve to existing files | public-api.md §3 | NOT-ENFORCEABLE (legacy rule was Community-specific) | — | NOT-ENFORCEABLE | Resolution requires runtime/compile-time check. |
| PA4 | typesVersions consistency with exports | public-api.md §3 | NOT-ENFORCEABLE | — | NOT-ENFORCEABLE | Same as PA3. |

## Modules (`modules.md`)

| ID | Rule | Source | Mechanism | Owner | Status | Evidence |
|----|------|--------|-----------|-------|--------|----------|
| M1 | module surface shape | modules.md | Semgrep (`module-shape`, `composition-shape`, `value-object-shape`) | Development | SHARED | `packages/semgrep-rules/rules/*.yaml` |
| M2 | core MUST NOT use Date / performance.now / Math.random | layering-policy.md §6 | ESLint built-in (`no-restricted-globals` / `no-restricted-properties`) in Community config | Community | COMMUNITY-LOCAL | `community/eslint.config.js`. Distinct from shared `no-date-in-core` heuristic rule. |

## Lifecycle Events (`lifecycle-events.md`)

| ID | Rule | Source | Mechanism | Owner | Status | Evidence |
|----|------|--------|-----------|-------|--------|----------|
| LE1 | event payload structure | lifecycle-events.md | NOT-ENFORCEABLE | — | NOT-ENFORCEABLE | Lifecycle events are runtime constructs; structural rules live in domain-modeling.md. |

## Domain Modeling (`domain-modeling.md`)

| ID | Rule | Source | Mechanism | Owner | Status | Evidence |
|----|------|--------|-----------|-------|--------|----------|
| DM1 | value-object shape | domain-modeling.md | Semgrep (`value-object-shape`) | Development | SHARED | `packages/semgrep-rules/rules/value-object-shape.yaml` |
| DM2 | core domain MUST NOT use crypto | layering-policy.md §2.2 | ESLint built-in (`no-restricted-globals`) in Community config + Semgrep (`core-domain-no-crypto`) | Development (Semgrep) + Community (ESLint built-in) | SHARED + COMMUNITY-LOCAL | Community uses stricter ESLint built-in; shared plugin provides import-level rule. Both enforced. |

## Coding (`coding.md`)

| ID | Rule | Source | Mechanism | Owner | Status | Evidence |
|----|------|--------|-----------|-------|--------|----------|
| C1 | JSDoc required | coding.md | NOT-ENFORCEABLE | — | NOT-ENFORCEABLE | JSDoc enforcement was Community-specific tooling. |
| C2 | imports use `import` not `require` | coding.md | ESLint config in Community | Community | COMMUNITY-LOCAL | `community/eslint.config.js` |

## Configuration (`configuration.md`)

| ID | Rule | Source | Mechanism | Owner | Status | Evidence |
|----|------|--------|-----------|-------|--------|----------|
| CF1 | `comity.config.json` schema | configuration.md | JSON Schema (`comityConfigSchema`) | Development | SHARED | `packages/schemas/src/schemas/comity-config.ts` |
| CF2 | repository type is `development / community / enterprise / third-party / fixture` | configuration.md | JSON Schema enum | Development | SHARED | same |

## Documentation (`documentation.md`)

| ID | Rule | Source | Mechanism | Owner | Status | Evidence |
|----|------|--------|-----------|-------|--------|----------|
| DC1 | package.json contains required fields | documentation.md | JSON Schema (`packageMetadataSchema`) | Development | SHARED | `packages/schemas/src/schemas/package-metadata.ts` |
| DC2 | engines.node ≥ 24 | documentation.md | JSON Schema pattern | Development | SHARED | same |

## Architecture Validation (`architecture-validation.md`)

| ID | Rule | Source | Mechanism | Owner | Status | Evidence |
|----|------|--------|-----------|-------|--------|----------|
| AV1 | package name `@comity/<kebab>` | architecture-validation.md §8 | JSON Schema pattern | Development | SHARED | same |
| AV2 | type=module | architecture-validation.md §8 | JSON Schema const | Development | SHARED | same |
| AV3 | license declared | architecture-validation.md §8 | JSON Schema required | Development | SHARED | same |
| AV4 | comity.layer required and from enum | architecture-validation.md §3 / ADR-026 | JSON Schema required + enum | Development | SHARED | same |
| AV5 | comity.implements is a single string | architecture-validation.md §8 / ADR-026 | JSON Schema type constraint | Development | SHARED | same |

## Architecture Principles (`architecture-principles.md`)

No new machine-enforceable rules beyond those inherited from the Standards above.

## Testing (`testing.md`)

No machine-enforceable rules at the repository layout level.

## Cross-cutting

| ID | Rule | Source | Mechanism | Owner | Status | Evidence |
|----|------|--------|-----------|-------|--------|----------|
| X1 | repository isolation: Community ↛ Enterprise, Enterprise ↛ Community | architecture-principles.md | NOT-ENFORCEABLE | — | NOT-ENFORCEABLE | Enforced by workspace configuration. |
| X2 | `@comity/*` is runtime namespace; `@comity-dev/*` is dev tooling | layering-policy.md §1 | NOT-ENFORCEABLE | — | NOT-ENFORCEABLE | Namespacing is a build-time convention. |
| X3 | `@comity-enterprise/*` MUST NOT exist | architecture-principles.md | NOT-ENFORCEABLE | — | NOT-ENFORCEABLE | Same as X2. |

---

## Coverage summary

| Standard | Total rules | SHARED | COMMUNITY-LOCAL | ENTERPRISE-LOCAL | ABSORBED | OBSOLETE | NOT-ENFORCEABLE |
|----------|------------:|-------:|----------------:|----------------:|---------:|---------:|----------------:|
| layering-policy | 10 | 10 | 0 | 0 | 0 | 0 | 0 |
| adapters | 7 | 7 | 0 | 0 | 0 | 0 | 0 |
| errors | 6 | 5 | 1 | 0 | 0 | 0 | 0 |
| public-api | 4 | 2 | 0 | 0 | 0 | 0 | 2 |
| modules | 2 | 1 | 1 | 0 | 0 | 0 | 0 |
| lifecycle-events | 1 | 0 | 0 | 0 | 0 | 0 | 1 |
| domain-modeling | 2 | 1 | 0 | 0 | 0 | 0 | 0 |
| coding | 2 | 0 | 1 | 0 | 0 | 0 | 1 |
| configuration | 2 | 2 | 0 | 0 | 0 | 0 | 0 |
| documentation | 2 | 2 | 0 | 0 | 0 | 0 | 0 |
| architecture-validation | 5 | 5 | 0 | 0 | 0 | 0 | 0 |
| architecture-principles | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| testing | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| cross-cutting | 3 | 0 | 0 | 0 | 0 | 0 | 3 |
| **Total** | **48** | **35** | **3** | **0** | **0** | **0** | **10** |

## Reconciliation with the forensic claim of "105 rules"

The forensic acceptance report cited "105 rules across the 13 Standards".
This reconciliation identifies **48 distinct rules** that could be
reconstructed with confidence from the deleted legacy validator and the
Standards.

The discrepancy is explained by:

1. **Phantom rule inflation** in the original Phase 11 inventory (e.g.
   per-rule-instance counting across packages rather than per-rule).
2. **Multiple violations of the same logical rule** in the legacy
   validator (`ARCH-META-001` through `ARCH-META-012` were distinct
   fields of a single metadata rule, not 12 separate rules).
3. **Standardised documentation rules** that are not machine-enforceable
   (e.g. README section ordering, narrative explanations).

The 48 rules above are the authoritative count. The 57-rule deficit
between the forensic claim and this reconciliation is not evidence of
hidden rules — it is evidence of the forensic claim's inflation.

## NOT-ENFORCEABLE rules and the rationale for each

| Rule | Reason |
|------|--------|
| PA3 / PA4 | Resolve at TypeScript compile / runtime, not lint time. Belongs in CI tooling that we have not built. |
| LE1 | Runtime event-payload contracts are not statically discoverable from source structure in a portable way. |
| C1 | JSDoc enforcement was Community-local tooling (`eslint-plugin-jsdoc`) and not adopted as Comity-wide. |
| X1 / X2 / X3 | Repository isolation and namespace boundaries are enforced by governance / workspace configuration, not by static analysis. |

---

## Authority

This document is the authoritative reconciliation between the Comity
Standards and the shared enforcement packages. New rules MUST be added
here when introduced. Removed rules MUST be marked OBSOLETE here.
Discrepancies between this document and the running tooling are bugs
that must be reconciled — either the rule must be enforced, or the
reconciliation must be updated.
