# @comity-dev/validate

## Purpose

Thin orchestrator over Comity shared validation tooling. Discovers a repository, invokes the specialized engines (schema, dependency-cruiser, ESLint, Semgrep, adapter-peers), and returns a normalized result.

This package is intentionally small. It does **not** implement any rule. Its only responsibilities are:

1. Discover repository configuration (`comity.config.json`).
2. Discover packages.
3. Invoke specialized engines.
4. Collect and normalize results.
5. Present a unified summary.

## Scope

The engines wrap shared Development-owned tooling:

| Engine          | Tool                                    | Concern                                                    |
| --------------- | --------------------------------------- | ---------------------------------------------------------- |
| `schema`        | `@comity-dev/schemas` (Ajv)             | JSON Schema for package metadata and `comity.config.json`. |
| `depcruise`     | `dependency-cruiser`                    | Dependency graph layering.                                 |
| `eslint`        | ESLint + `@comity-dev/eslint-plugin`    | Source-code lint policy.                                   |
| `semgrep`       | `semgrep` + `@comity-dev/semgrep-rules` | Structural source patterns.                                |
| `adapter-peers` | in-process                              | Adapter peer-dependency contract.                          |

Engines report one of `PASS` / `FAIL` / `NOT-RUN` / `TOOL-UNAVAILABLE` / `CONFIGURATION-ERROR` / `EXECUTION-ERROR` / `NOT-APPLICABLE`. `PASS` is only reported when the engine actually executed.

## Ownership

Owned by `comity-development`. Consumed by Comity repositories via the `comity-validate` CLI.

## Public API

```ts
import {
  runValidation,
  discoverRepository,
  formatSummary,
  formatViolations,
  ExitCode,
} from "@comity-dev/validate";
```

## CLI

```bash
comity-validate --repo /path/to/repo
comity-validate --only=schema        # one engine only
comity-validate --only=eslint --verbose
```

Exit codes:

- `0` — validation passed
- `1` — validation failed (violations found)
- `2` — configuration / discovery error
- `3` — required tool not installed

## Environment

The Semgrep engine shells out to a local Semgrep installation:

| Variable         | Purpose                                                                                          |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| `SEMGREP_BIN`    | Path to the `semgrep` executable. Used as-is when it exists; otherwise resolved from PATH.       |
| `SEMGREP_PYTHON` | Path to the Python interpreter that ships the `semgrep` module. The scan is executed with it.    |

Rules:

- An explicit `SEMGREP_PYTHON` always wins and is never silently overridden.
- A set-but-missing `SEMGREP_PYTHON` is invalid configuration: the engine
  reports `TOOL-UNAVAILABLE` naming the variable instead of falling back to
  another interpreter.
- When `SEMGREP_PYTHON` is unset, the previous resolution applies
  (`/usr/bin/python3`, `/usr/local/bin/python3`, `/opt/homebrew/bin/python3`,
  then `python3` on PATH).
- The scan `PATH` is prefixed with the directories of the resolved
  `SEMGREP_BIN` and interpreter so Semgrep finds its sibling `pysemgrep`.

```bash
SEMGREP_BIN=~/.local/bin/semgrep SEMGREP_PYTHON=/opt/homebrew/bin/python3 \
  comity-validate --repo /path/to/repo
```

## Negative fixtures

The `src/__fixtures__/third-repo/` directory contains a deliberately invalid repository used by the package's own integration tests. It is **not** scanned by the canonical validate run (the engine excludes `__fixtures__/**`); it is asserted against failure by `src/__tests__/integration.test.ts`.

## Development

```bash
pnpm build
pnpm test
```

## Relationship to Comity Standards

- `layering-policy.md`
- `architecture-validation.md`
- `ADR-008`, `ADR-026`
- `adapters.md` §13 (adapter-peer engine)
