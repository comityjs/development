# @comity-dev/semgrep-rules

## Purpose

Reusable Semgrep rule set for Comity structural source-code patterns. Semgrep is well-suited to **structural patterns** that ESLint cannot express cleanly: class shape, interface structure, method signatures, prohibited implementation patterns.

## Scope

The canonical rule files live under `./rules/` as YAML. The package also exports a loader that produces a single combined Semgrep config suitable for a single `--config` invocation.

## Ownership

Owned by `comity-development`. Consumed by `@comity-dev/validate` which actually invokes the `semgrep` binary.

The rule set targets **runtime** Core Modules and Adapters only. It does NOT apply to Development tooling packages (`comity.layer: "dev-tooling"`), which legitimately use Node APIs (`process.env`, etc.) that the rules forbid for runtime code.

## Public API

```ts
import {
  listRuleFiles,
  loadRule,
  loadAllRules,
  buildSemgrepConfig,
} from "@comity-dev/semgrep-rules";
```

The `./rules` subpath exposes the raw YAML rule files:

```ts
import rulePath from "@comity-dev/semgrep-rules/rules/<file>.yaml";
```

## Relationship to Comity Standards

- `adapters.md` §11 — Adapter contract implementation shape.
- `errors.md` — error class shape.
- `modules.md` — module surface shape.

## Development

```bash
pnpm build
pnpm test
```

## Tool availability

The `semgrep` binary is **optional**. When missing, the validator reports `TOOL-UNAVAILABLE` rather than fabricating PASS. Install via `pip install semgrep` or set `SEMGREP_BIN` to an absolute path.
