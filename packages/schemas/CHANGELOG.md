# @comity-dev/schemas

## 0.4.0

### Minor Changes

- df5a7b6: Include ADR-008 Amendment 3 in the embedded canonical register.

  - `adr008CoreExceptionRegister` gains one approved type-only Capability Exception, `@comity/entitlement` → `@comity/organization` (`TenantId`), and now has 20 edges (previously 19). No existing edge changes.
  - `schemaVersion` is unchanged at `1`; the schema document is unchanged. This is a register-content change only.

## 0.3.0

### Minor Changes

- b397c6a: Align the published ADR-008 register contract with the canonical ADR-008/ADR-009 artifacts (breaking under 0.x).

  - `adr008RegisterSchema` is now the canonical JSON Schema 2020-12 document (required edge fields `from`, `to`, `layer`, `categories`, `importKind`, `lifecycle`, `justification`, `adrReference`; conditional `removalCandidate`). It replaces the former `{ version, edges: { from, to, adr, rationale } }` schema, which rejected every real register.
  - `adr008CoreExceptionRegister` is derived at build time from `docs/standards/decisions/data/adr-008-core-exception-register.json` instead of a hand-maintained copy. It now has 19 edges: `order → pricing` is `value` (ADR-008 Amendment 1) and `fulfillment → order` / `fulfillment → organization` are registered (ADR-008 Amendment 2).
  - `validateAdr008Register` compiles with a new `createAjv2020Instance()` (exported); pass a 2020-12 Ajv if you supply your own instance.
  - `Adr008Register` changes from `{ version: "1"; edges }` to `{ $schema; schemaVersion; authority; source; edges }`; `Adr008RegisterEdge` is exported.
  - Corrected the canonical schema's `source` constant to `../ADR-008-explicit-core-module-composition-exceptions.md`.

  Migration: data using the legacy `{ version, adr, rationale }` shape was never valid canonical data; use the canonical register shape and `schemaVersion: 1`.

## 0.2.0

### Minor Changes

- 5c68c74: 0.2.0 release

## 0.1.1

### Patch Changes

- bd0d03b: Add initial release changesets
