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

export { plugin as default, RULE_IDS } from "./plugin.js";
export { recommended } from "./recommended.js";
