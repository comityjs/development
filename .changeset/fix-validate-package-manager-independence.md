---
"@comity-dev/validate": patch
---

Make the validator work in clean npm and pnpm consumers without installing its tools or ESLint configuration dependencies directly.

- Executable resolution: `dependency-cruiser` and `eslint` are resolved from the validator's own dependency graph (`import.meta.resolve`, then the dependency's declared `bin`) and run with the current Node binary. The previous lookup of `<validate>/node_modules/.bin` failed under npm, where dependencies are hoisted, so the dependency and ESLint engines reported `TOOL-UNAVAILABLE`. Unresolvable tools remain `TOOL-UNAVAILABLE`, now with the reason.
- ESLint configuration: `@comity-dev/eslint-plugin`, its `recommended` preset and `@typescript-eslint/parser` are resolved from the validator's own dependency graph instead of the validated repository's `node_modules`. Under pnpm they were not found unless the consumer had installed them directly, and the engine crashed with `ERR_MODULE_NOT_FOUND`.
- Behavior change: ESLint now always runs with the plugin and parser versions this validator declares, not versions the consumer happens to install.
- ESLint diagnostics: the crash finding kept only the first stderr line, which is blank for ESLint, hiding the cause. The full (bounded) stderr is now kept.
- ESLint fail-closed: output that cannot be interpreted as ESLint's JSON result, including an exit code of 0 with empty or malformed output, was treated as zero findings and reported `PASS`. It is now `EXECUTION-ERROR`.
- Semgrep: removed hardcoded developer-specific directories from the child `PATH`.
- ESLint and Semgrep temporary files now use `os.tmpdir()` instead of `/tmp` and are removed on every path.

The public API is unchanged. Repositories that previously reported `TOOL-UNAVAILABLE` (npm) or `EXECUTION-ERROR` (pnpm) for the dependency or ESLint engines will now report real results, which can include genuine findings.
