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

The `./rules/*.yaml` subpath pattern exposes each raw YAML rule file for **path resolution**. The files are Semgrep configuration data, not JavaScript modules, so resolve them to a path (for example to pass to `semgrep --config`) rather than `import`ing them:

```ts
import { fileURLToPath } from "node:url";

const rulePath = fileURLToPath(
  import.meta.resolve("@comity-dev/semgrep-rules/rules/module-shape.yaml"),
);
```

```js
// CommonJS-syntax code on Node 24+
const rulePath = require.resolve("@comity-dev/semgrep-rules/rules/module-shape.yaml");
```

Available files: `adapter-contract-shape.yaml`, `composition-shape.yaml`, `core-domain-no-crypto.yaml`, `error-class-shape.yaml`, `module-shape.yaml`, `value-object-shape.yaml`. Only `*.yaml` files directly under `rules/` are exported; the bare `@comity-dev/semgrep-rules/rules` directory is not an entry point (use `listRuleFiles()` to enumerate the files).

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
