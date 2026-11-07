# @comity-dev/validate

## Purpose

Thin orchestrator over Comity shared validation tooling. Discovers a repository, invokes the specialized engines (schema, dependency-cruiser, ESLint, Semgrep, adapter-peers, declarations), and returns a normalized result.

This package is intentionally small. It does **not** implement source-code rules; the in-process declaration engine
implements the rules in ADR-035. Its only responsibilities are:

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
| `declarations`  | in-process + TypeScript                 | Published declaration dependency contract (ADR-035).       |
| `packed-surface` | in-process + `pnpm pack` + system `tar` | Packed tarball surface: rules `ARCH-PACK-001…006` (ADR-035 stage 2). |

Engines report one of `PASS` / `FAIL` / `NOT-RUN` / `TOOL-UNAVAILABLE` / `CONFIGURATION-ERROR` / `EXECUTION-ERROR` / `NOT-APPLICABLE`. `PASS` is only reported when the engine actually executed.

### Dependency engine (`depcruise`)

The engine generates architecture rules with `@comity-dev/dependency-rules`, runs `dependency-cruiser --output-type json` from the repository root, and validates the result before trusting it.

- **Result contract.** dependency-cruiser's JSON result is `{ modules, summary }`. Violations are in `summary.violations`; each entry has `from` and `to` (module path strings) and `rule: { name, severity }`. Per-severity totals are `summary.error|warn|info|ignore`, and `summary.ruleSetUsed.forbidden` lists the rules applied. The same shape is declared in dependency-cruiser v9 through v17. Supported range: `^16.10.4`; tests run against the lockfile-resolved version (16.10.4) with captured real output in `src/engines/__tests__/__fixtures__/`.
- **Exit code is not a verdict.** The JSON reporter always exits `0`, even when error violations exist. The verdict comes from the validated violation entries.
- **Type-only imports** are included (the generated configuration enables `tsPreCompilationDeps`), so a forbidden `import type` fails exactly like a forbidden runtime import.
- **Severities.** `error` violations fail validation. `warn` and `info` violations are reported as warnings and do not fail it (the same policy as the ESLint engine). Findings are counted from the entries, never from the summary counters as well.
- **Fail closed.** Output that is empty, not JSON, not the schema above, internally inconsistent (counters that disagree with the entries), a non-zero exit that the result does not explain, a crash, a start-up failure, or a kill by signal is reported as `EXECUTION-ERROR` (rule `DEP-CRASH`), never `PASS`.
- **Rules were applied.** The engine fails with `EXECUTION-ERROR` if dependency-cruiser did not apply the number of rules that were generated, or if no cruised module is governed by any generated rule. An individual rule that matches no module is not an error.
- **No layered packages.** A repository in which no package declares a `comity.layer` reports `NOT-APPLICABLE` instead of `PASS`.

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
comity-validate --only=declarations
```

`--only <category>` runs a single engine. Policies owned by another engine are
not evaluated: `--only semgrep` does not check ESLint-owned policy, including
the required `@internal` marker rule (`@comity-dev/require-internal-marker`).
Use the default run (no `--only`) for full policy coverage.

### `packed-surface` (ADR-035 stage 2)

`--only=packed-surface` packs every publishable package with `pnpm pack`, reads the resulting tarball (file list,
contents and packed `package.json`) with the system `tar`, and applies `ARCH-PACK-001…006`. It never reads the
workspace `dist`, so it observes the effect of the `files` field, `exports` and `workspace:` rewriting — which stage 1
cannot see.

It is deliberately **not part of the default run**: it packs every package (slower) and it runs in the producer
repository after `pnpm build` and before publication. Both release workflows run it after `Build` and before the
Changesets `Release` step.

**Enforcement is active (2026-11-05).** The release-workflow step blocks publication only when the repository variable
`COMITY_PACKED_SURFACE_ENFORCEMENT` is `true`; that variable is **set in both `comityjs/development` and `comityjs/framework`**, so a
stage-2 finding now fails the release job before publication. It was activated only after **WP-A1** (Community `workspace:*` migration),
**WP-A4** (Development `@comity-dev/*` migration) and **WP-B** formal ratification were complete, because `pnpm pack` rewrites
`workspace:*` to an exact pin and `ARCH-PACK-005` reports those pins; both repositories now report **0 findings**. Local runs are
unaffected: the category still runs only with `--only=packed-surface` and the default `validate` categories are unchanged.

Exit codes:

- `0` — validation passed
- `1` — validation failed (violations found)
- `2` — configuration / discovery error (may co-occur with findings)
- `3` — required tool not installed

## Environment

The Semgrep engine shells out to a local Semgrep installation:

| Variable                    | Purpose                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| `SEMGREP_BIN`               | Path to the `semgrep` executable. Used as-is when it exists; otherwise resolved from PATH.       |
| `SEMGREP_PYTHON`            | Path to the Python interpreter that ships the `semgrep` module. The scan is executed with it.    |
| `COMITY_SEMGREP_TIMEOUT_MS` | Overall scan timeout in milliseconds. Defaults to `300000` (five minutes). Must be an integer between `1` and `2147483647`; invalid or oversized values are reported as `CONFIGURATION-ERROR`. |

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
- Every scan has an overall liveness bound (`COMITY_SEMGREP_TIMEOUT_MS`). A
  timeout is reported as `EXECUTION-ERROR`, never as PASS. On POSIX the
  scanner's process group is terminated so Semgrep's Python and `semgrep-core`
  descendants do not remain running; on Windows only the immediate child can
  be signalled, so descendant termination is best-effort.
- `--verbose` emits a stderr heartbeat every ten seconds while a scan is
  running; the final summary remains on stdout.
- A file Semgrep could not fully parse (`PartialParsing`) is reported as
  `EXECUTION-ERROR` with a `SEM-PARTIAL-PARSE` finding naming the file, never
  as PASS: a partially parsed file may have been skipped by AST-based rules,
  so the scan is incomplete rather than clean.

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
