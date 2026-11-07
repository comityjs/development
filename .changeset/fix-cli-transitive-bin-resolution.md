---
"@comity-dev/cli": patch
---

Fix `comity validate` (and `comity build` / `comity normalize`) failing with `spawn .../node_modules/.bin/comity-validate ENOENT` when `@comity-dev/cli` is the only installed Comity package under pnpm. The CLI now resolves delegated executables from its own declared dependencies (`@comity-dev/validate`, `@comity-dev/build`, `@comity-dev/package-tools`) via their `bin` field instead of the consumer's root `node_modules/.bin`, runs them with the current Node binary, forwards termination signals, reports a signal-killed child as exit status 128 + signal number, and fails with an error that preserves the underlying cause when an executable cannot be resolved.
