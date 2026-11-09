---
"@comity-dev/schemas": minor
---

Include ADR-008 Amendment 3 in the embedded canonical register.

- `adr008CoreExceptionRegister` gains one approved type-only Capability Exception, `@comity/entitlement` → `@comity/organization` (`TenantId`), and now has 20 edges (previously 19). No existing edge changes.
- `schemaVersion` is unchanged at `1`; the schema document is unchanged. This is a register-content change only.
