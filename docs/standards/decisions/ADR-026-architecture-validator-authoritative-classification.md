# ADR-026 — Architecture Validator Authoritative Package Classification

> **Provenance:**
> - Originally: `comity-community/docs/standards/decisions/ADR-026-architecture-validator-authoritative-classification.md`
> - Migrated to: `comity-development/docs/standards/decisions/ADR-026-architecture-validator-authoritative-classification.md`
> - Migration: Phase 4
> - Original semantic owner: Comity-wide
> - Canonical owner: comity-development


**Status:** Accepted

## Context

ADR-010 defined the design of the architecture validator. The validator's package classification was derived from the repository inventory (a manually maintained Markdown document in comity-community). This created a structural blind spot: a package could exist in `packages/**` without being listed in the inventory and escape layer-specific validation entirely.

The repository now has 52 packages, all properly classified in `repository.md`, but the classification mechanism remains fragile and manual.

## Decision

Package classification used for architectural validation **must come from authoritative machine-readable package metadata** in each package's `package.json`, not from manually maintained Markdown.

### Package Metadata Schema

Each `@comity/*` package MUST include a `comity` object in its `package.json`:

```json
{
  "comity": {
    "layer": "core",
    "implements": "@comity/acl"
  }
}
```

**Required fields:**
- `layer` (string, required): One of `primitives`, `kernel`, `composition`, `core`, `technology-adapter`, `integration-adapter`

**Optional fields:**
- `implements` (string, required for technology adapters): The Core Module package name this adapter implements (e.g., `@comity/acl`)

### Scope: runtime vs. development packages

ADR-026 defines `comity.layer` as the architecture classification of Comity RUNTIME packages (`@comity/*`). The six values above are the complete, closed set of runtime layers; no other value is a runtime layer.

`@comity-dev/*` (Development tooling) packages are out of scope for runtime architecture. They MAY declare a reserved `dev-tooling` layer for purposes of scoping the validator engines (semgrep, eslint, depcruise) away from Development source. The `dev-tooling` value is NOT a seventh runtime layer, MUST NOT be used by `@comity/*` packages, and does not participate in the runtime dependency-graph rules.

The name-scope ↔ layer boundary is enforced by the canonical package-metadata JSON Schema (`@comity-dev/schemas/src/schemas/package-metadata.ts`):

- `@comity/*` → `comity.layer` MUST be one of the six runtime layers.
- `@comity-dev/*` → `comity.layer` MUST be `dev-tooling`.

### Validator Behavior

The validator now:
1. Discovers all workspace packages from the filesystem (`packages/**/package.json`)
2. Reads their authoritative `comity.layer` metadata
3. Fails if an `@comity/*` package has no layer classification
4. Builds Core/Kernel/Adapter sets from package metadata
5. Validates all discovered internal dependencies against layering rules
6. Ensures adapter `implements` metadata is valid where applicable
7. Continues validating README/documentation separately from architectural classification

### Migration Strategy

All existing packages have been updated with `comity.layer` metadata matching their classification in `repository.md`. The `repository.md` document remains as human-readable documentation but is no longer the authoritative source for validation.

The `classifyFromRepository` function is retained for documentation validation purposes only.

## Consequences

**Positive:**
- No package can escape layer validation by being omitted from `repository.md`
- Classification is versioned with the package itself
- Machine-readable and enforceable in CI
- Clear migration path for new packages (add `comity` field to package.json)

**Negative / Trade-offs:**
- New metadata field must be maintained in each package.json
- `repository.md` can drift from reality (mitigated: it's now documentation-only)

## Scope

This ADR concerns:
- the authoritative source of package layer classification;
- the package.json metadata schema;
- supported layer values;
- adapter implementation metadata;
- validator behavior when metadata is missing;
- migration strategy for existing packages;
- relationship between machine-readable package metadata and `repository.md`.

This ADR does NOT concern:
- ADR-025 (Execution Context Composition) — remains unchanged;
- ADR-008 register contents — unchanged by this ADR;
- new Core-to-Core dependencies.

## References

- ADR-010 — Architecture Validator Design
- ADR-008 — Explicit Core Module Composition Exceptions (Community-specific register instance in comity-community)
- `scripts/architecture-validator/graph.mjs` — classification implementation
- `scripts/architecture-validator/validator.test.mjs` — regression tests
