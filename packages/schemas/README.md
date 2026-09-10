# @comity-dev/schemas

## Purpose

Canonical, machine-readable JSON Schema definitions for Comity package metadata, the ADR-008 register, and `comity.config.json`. These schemas are the authoritative source for Comity-wide metadata policy.

## Scope

- `package-metadata.v1.json` — required fields and types for every `@comity/*` package's `package.json` (`name`, `version`, `type`, `license`, `engines`, `exports`, `comity.layer`, `comity.implements`).
- ADR-008 register schema — machine-readable composition exception register.
- `comity-config.json` schema — repository-level configuration shape.

## Ownership

Owned by `comity-development`. Consumed by `@comity-dev/validate` (in-process) and indirectly by every Comity repository via the validator.

## Public API

```ts
import {
  packageMetadataSchema,
  validatePackageMetadata,
  comityConfigSchema,
  validateComityConfig,
  adr008RegisterSchema,
  validateAdr008Register,
  createAjvInstance,
  PACKAGE_NAME_PATTERN,
  VALID_LAYERS,
  MIN_NODE_VERSION,
} from "@comity-dev/schemas";
```

A consolidated subpath exposes every schema and its validator for
finer-grained consumers:

```ts
import {
  packageMetadataSchema,
  validatePackageMetadata,
  comityConfigSchema,
  validateComityConfig,
  adr008RegisterSchema,
  validateAdr008Register,
} from "@comity-dev/schemas";
```

## Relationship to Comity Standards

- `layering-policy.md` §2.1 — layer enum source.
- `ADR-026` — authoritative package classification.
- `architecture-validation.md` §8 — package metadata, naming, engines.

## Development

```bash
pnpm build
pnpm test
```
