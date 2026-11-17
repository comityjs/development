# Release deviation record — `@comity/primitives@0.9.4`

**Date:** 2026-11-12
**Status:** Recorded and ratified as a documented deviation. No retroactive republish is proposed.

## Affected release

- Package: `@comity/primitives`
- Published version: **0.9.4** (`community/packages/primitives/CHANGELOG.md`, entry `352ee1b`)

## The discrepancy

- The release added the `conflict` repository error reason (HTTP 409, optional `suppliedVersion` / `storedVersion` details) under ADR-029.
- The applicable rule, `docs/standards/errors.md` §10 (Versioning Rules), states: _"Adding a new `reason` → MINOR version bump."_
- The release was published as a **PATCH** (the changelog lists it under "Patch Changes").
- The same release also introduced the `@comity/primitives/testing` subpath; this record concerns the error-reason classification only.

## Disposition

- The version is **already published**. The published artifact, its version number, the changelog and package metadata are **not changed** by this record.
- The historical release is **ratified as a documented deviation** from `errors.md` §10. It is not described as prevented, corrected or reclassified retroactively.
- The practical impact is limited to version-range expectations: consumers using a PATCH-only range receive the new reason, and exhaustive external switches over `RepositoryErrorReason` become non-exhaustive (the consequence ADR-029 already documents).

## Going forward

Future additions of an error reason to any Comity package MUST follow the MINOR rule of `errors.md` §10 and be released as at least a MINOR version.

## References

- `docs/standards/errors.md` §10
- `docs/standards/decisions/ADR-029-repository-optimistic-concurrency.md` (Compatibility and migration)
