/**
 * Recommended Comity ESLint rule set.
 *
 * The "recommended" preset bundles the canonical Comity rules with their
 * default severities. Repositories MAY override severities; they MUST NOT
 * disable rules silently.
 */
import type { Linter } from "eslint";

export const recommended: Linter.Config = {
  rules: {
    "@comity-dev/no-forbidden-deep-import": "error",
    "@comity-dev/no-layer-violation": "error",
    "@comity-dev/no-date-in-core": "error",
    "@comity-dev/no-crypto-in-core": "error",
    "@comity-dev/no-forbidden-subpath-import": "error",
    "@comity-dev/no-render-core-http-runtime": "error",
  },
};
