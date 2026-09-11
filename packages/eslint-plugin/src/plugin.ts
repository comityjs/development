/**
 * @comity-dev/eslint-plugin — Reusable ESLint rules for Comity source-code policy.
 *
 * This package owns the canonical ESLint rules for Comity. Repositories
 * consume these rules via the shared orchestrator; they MUST NOT redefine
 * source-code policy.
 *
 * Standard references:
 *   - architecture-validation.md §4
 *   - public-api.md §3.2 (forbidden subpath imports)
 *   - layering-policy.md §8 (rendering core MUST NOT depend on HTTP runtime)
 *   - coding.md (general style policy)
 *
 * Public surface (intentional):
 *   - default export: the ESLint plugin (loaded into flat-config)
 *   - `recommended`: the canonical Comity rule set
 *   - `RULE_IDS`: stable list of rule identifiers
 */
import type { ESLint } from "eslint";

import noCryptoInCore from "./rules/no-crypto-in-core.js";
import noDateInCore from "./rules/no-date-in-core.js";
import noForbiddenDeepImport from "./rules/no-forbidden-deep-import.js";
import noForbiddenSubpathImport from "./rules/no-forbidden-subpath-import.js";
import noLayerViolation from "./rules/no-layer-violation.js";
import noRenderCoreHttpRuntime from "./rules/no-render-core-http-runtime.js";

export interface BuiltinRule {
  /** The stable identifier of the rule */
  name: string;

  /** The rule implementation */
  rule: unknown;
}

export const BUILTIN_RULES: BuiltinRule[] = [
  { name: "no-forbidden-deep-import", rule: noForbiddenDeepImport },
  { name: "no-layer-violation", rule: noLayerViolation },
  { name: "no-date-in-core", rule: noDateInCore },
  { name: "no-crypto-in-core", rule: noCryptoInCore },
  { name: "no-forbidden-subpath-import", rule: noForbiddenSubpathImport },
  { name: "no-render-core-http-runtime", rule: noRenderCoreHttpRuntime },
];

export const plugin: ESLint.Plugin = {
  meta: {
    name: "@comity-dev/eslint-plugin",
    version: "0.1.0",
  },
  rules: Object.fromEntries(
    BUILTIN_RULES.map((r) => [r.name, r.rule as never]),
  ),
};

/** Stable list of rule identifiers exported by this plugin. */
export const RULE_IDS: string[] = BUILTIN_RULES.map((r) => r.name);
