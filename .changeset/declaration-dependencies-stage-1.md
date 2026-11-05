---
"@comity-dev/validate": minor
---

Add stage 1 workspace declaration validation (ADR-035, WP-C1). The new `declarations` category (alias `declaration-dependencies`) checks every external module reference reachable from a package's published declaration entry points against its `dependencies` and `peerDependencies`, with deterministic name-agnostic package discovery and the `ARCH-DECL-DEP-000…005` rules. A missing build target is reported as `CONFIGURATION-ERROR` with exit code 2, never as a pass.

This release also makes validation findings visible in normal output for every category without requiring `--verbose`, and adds `declarations` to `--only`. Existing categories and exit codes are unchanged apart from the always-visible findings behaviour approved in ADR-035 Decision 13.
